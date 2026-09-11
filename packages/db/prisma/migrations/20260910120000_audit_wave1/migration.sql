-- Audit wave 1: search indexes, composite indexes, provenance uniqueness,
-- sense attestations, sense slugs, source license fields, tag governance,
-- meaning-level search index, markdown-free entry search document, and
-- retirement of view tracking.

-- 1.1 Restore trigram + prefix + slug indexes on entry_search
CREATE INDEX IF NOT EXISTS "entry_search_normalized_title_trgm_idx"
  ON "entry_search" USING GIN ("normalized_title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "entry_search_normalized_title_pattern_idx"
  ON "entry_search" ("normalized_title" text_pattern_ops);
CREATE INDEX IF NOT EXISTS "entry_search_primary_slug_idx"
  ON "entry_search" ("primary_slug");
CREATE INDEX IF NOT EXISTS "entry_search_primary_slug_pattern_idx"
  ON "entry_search" ("primary_slug" text_pattern_ops);

-- 2.13 Composite indexes for common public queries
CREATE INDEX IF NOT EXISTS "entries_status_deleted_at_updated_at_idx"
  ON "entries" ("status", "deleted_at", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "senses_entry_id_status_deleted_at_idx"
  ON "senses" ("entry_id", "status", "deleted_at");
CREATE INDEX IF NOT EXISTS "audit_events_created_at_idx"
  ON "audit_events" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "entry_variants_entry_id_idx"
  ON "entry_variants" ("entry_id");

-- 2.13 Drop the duplicate partial unique index added on 2026-03-26
DROP INDEX IF EXISTS "tags_slug_active_unique";

-- 3.6 Idempotent provenance: dedupe then add unique constraints
DELETE FROM "field_provenance" fp
USING "field_provenance" keep
WHERE fp.entity_type = keep.entity_type
  AND fp.entity_id = keep.entity_id
  AND fp.field_name = keep.field_name
  AND fp.citation_id = keep.citation_id
  AND fp.id > keep.id;
CREATE UNIQUE INDEX IF NOT EXISTS "field_provenance_entity_field_citation_key"
  ON "field_provenance" ("entity_type", "entity_id", "field_name", "citation_id");

-- Repoint duplicate citations to the oldest row, then dedupe
WITH ranked AS (
  SELECT id, source_id, source_document_id, url,
         FIRST_VALUE(id) OVER (PARTITION BY source_id, source_document_id, url ORDER BY accessed_at ASC, id ASC) AS keep_id
  FROM "citations"
)
UPDATE "field_provenance" fp
SET citation_id = r.keep_id
FROM ranked r
WHERE fp.citation_id = r.id AND r.id <> r.keep_id
  AND NOT EXISTS (
    SELECT 1 FROM "field_provenance" x
    WHERE x.entity_type = fp.entity_type AND x.entity_id = fp.entity_id
      AND x.field_name = fp.field_name AND x.citation_id = r.keep_id
  );
DELETE FROM "field_provenance" fp
USING "citations" c, (
  SELECT id, FIRST_VALUE(id) OVER (PARTITION BY source_id, source_document_id, url ORDER BY accessed_at ASC, id ASC) AS keep_id
  FROM "citations"
) r
WHERE fp.citation_id = c.id AND c.id = r.id AND r.id <> r.keep_id;
DELETE FROM "citations" c
USING (
  SELECT id, FIRST_VALUE(id) OVER (PARTITION BY source_id, source_document_id, url ORDER BY accessed_at ASC, id ASC) AS keep_id
  FROM "citations"
) r
WHERE c.id = r.id AND r.id <> r.keep_id;
CREATE UNIQUE INDEX IF NOT EXISTS "citations_source_document_url_key"
  ON "citations" ("source_id", "source_document_id", "url");

-- 3.1 Sense = meaning; definitions = per-source attestations
CREATE TABLE IF NOT EXISTS "sense_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sense_id" UUID NOT NULL,
  "citation_id" UUID NOT NULL,
  "definition_md" TEXT NOT NULL,
  "definition_text" TEXT NOT NULL,
  "content_mode" "ContentMode" NOT NULL DEFAULT 'SUMMARIZED',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "similarity_to_primary" DOUBLE PRECISION,
  "source_locator" JSONB,
  "extractor_version" TEXT,
  "extracted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sense_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sense_definitions_sense_id_fkey" FOREIGN KEY ("sense_id") REFERENCES "senses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sense_definitions_citation_id_fkey" FOREIGN KEY ("citation_id") REFERENCES "citations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "sense_definitions_sense_id_citation_id_key"
  ON "sense_definitions" ("sense_id", "citation_id");
CREATE INDEX IF NOT EXISTS "sense_definitions_citation_id_idx" ON "sense_definitions" ("citation_id");

-- 3.1 / 3.10 Sense metadata: stable slug, needs-label flag
ALTER TABLE "senses" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "senses" ADD COLUMN IF NOT EXISTS "needs_label" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "senses" ADD COLUMN IF NOT EXISTS "disambiguation_note" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "senses_entry_id_slug_active_key"
  ON "senses" ("entry_id", "slug") WHERE "deleted_at" IS NULL AND "slug" IS NOT NULL;

-- Backfill sense slugs from label, expanded form, or order
CREATE OR REPLACE FUNCTION synac_slugify(input TEXT) RETURNS TEXT AS $$
  SELECT NULLIF(
    trim(BOTH '-' FROM regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$ LANGUAGE sql IMMUTABLE;

DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN SELECT id, entry_id, sense_label, expanded_form, sense_order FROM senses WHERE slug IS NULL ORDER BY entry_id, sense_order LOOP
    base := coalesce(synac_slugify(r.sense_label), synac_slugify(r.expanded_form), 'sense-' || (r.sense_order + 1));
    base := left(base, 80);
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM senses s WHERE s.entry_id = r.entry_id AND s.slug = candidate AND s.deleted_at IS NULL AND s.id <> r.id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE senses SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- Backfill sense_definitions from existing per-sense provenance
INSERT INTO "sense_definitions" ("sense_id", "citation_id", "definition_md", "definition_text", "content_mode", "is_primary", "source_locator", "extractor_version", "extracted_at")
SELECT DISTINCT ON (s.id, fp.citation_id)
  s.id, fp.citation_id,
  coalesce(s.definition_md, s.definition_text, ''),
  coalesce(s.definition_text, s.definition_md, ''),
  fp.content_mode,
  true,
  fp.source_locator,
  fp.extractor_version,
  fp.extracted_at
FROM senses s
JOIN field_provenance fp ON fp.entity_type = 'SENSE' AND fp.entity_id = s.id AND fp.field_name = 'definitionMd'
WHERE s.deleted_at IS NULL
ORDER BY s.id, fp.citation_id, fp.extracted_at DESC
ON CONFLICT DO NOTHING;

-- 3.3 Source license fields and snapshot policy
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "license_url" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "license_public_statement" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "attribution_html" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "tier_rationale" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "snapshot_allowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "default_content_mode" "ContentMode" NOT NULL DEFAULT 'SUMMARIZED';

-- 3.4 Tag governance
DO $$ BEGIN
  CREATE TYPE "TagKind" AS ENUM ('DOMAIN', 'FACET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "TagAssignment" AS ENUM ('EDITORIAL', 'AUTO', 'INGEST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "parent_id" UUID;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "kind" "TagKind" NOT NULL DEFAULT 'DOMAIN';
DO $$ BEGIN
  ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "tags_parent_id_idx" ON "tags" ("parent_id");
ALTER TABLE "entry_tags" ADD COLUMN IF NOT EXISTS "assigned_by" "TagAssignment" NOT NULL DEFAULT 'EDITORIAL';
ALTER TABLE "entry_tags" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3.7 Relationship provenance
ALTER TABLE "entry_relationships" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "entry_relationships" ADD COLUMN IF NOT EXISTS "source_id" UUID;
DO $$ BEGIN
  ALTER TABLE "entry_relationships" ADD CONSTRAINT "entry_relationships_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2.8 Retire view tracking (no reader since /trending was removed)
DROP TABLE IF EXISTS "entry_views";

-- 2.5 Markdown-free entry search document with sense labels and attestations
CREATE OR REPLACE FUNCTION synac_refresh_entry_search(target_entry_id uuid) RETURNS void AS $$
DECLARE
  v_entry_type "EntryType";
  v_normalized_title TEXT;
  v_primary_slug TEXT;
  v_search_document TEXT;
BEGIN
  SELECT
    e.entry_type,
    e.normalized_title,
    e.primary_slug,
    lower(
      trim(
        concat_ws(
          ' ',
          e.display_title,
          coalesce(e.summary_text, ''),
          (
            SELECT string_agg(ev.variant_text, ' ' ORDER BY ev.variant_text)
            FROM entry_variants ev
            WHERE ev.entry_id = e.id
          ),
          (
            SELECT string_agg(
              trim(
                concat_ws(
                  ' ',
                  s.sense_label,
                  s.expanded_form,
                  coalesce(s.definition_text, ''),
                  (
                    SELECT string_agg(sd.definition_text, ' ')
                    FROM sense_definitions sd
                    WHERE sd.sense_id = s.id
                  ),
                  (
                    SELECT string_agg(coalesce(se.example_text, ''), ' ' ORDER BY se.example_order)
                    FROM sense_examples se
                    WHERE se.sense_id = s.id
                  )
                )
              ),
              ' ' ORDER BY s.sense_order
            )
            FROM senses s
            WHERE s.entry_id = e.id
              AND s.deleted_at IS NULL
              AND s.status = 'PUBLISHED'
          )
        )
      )
    )
  INTO v_entry_type, v_normalized_title, v_primary_slug, v_search_document
  FROM entries e
  WHERE e.id = target_entry_id
    AND e.deleted_at IS NULL
    AND e.status = 'PUBLISHED';

  IF NOT FOUND THEN
    DELETE FROM entry_search WHERE entry_id = target_entry_id;
    RETURN;
  END IF;

  INSERT INTO entry_search (entry_id, entry_type, normalized_title, primary_slug, search_document, updated_at)
  VALUES (target_entry_id, v_entry_type, v_normalized_title, v_primary_slug, v_search_document, NOW())
  ON CONFLICT (entry_id) DO UPDATE SET
    entry_type = EXCLUDED.entry_type,
    normalized_title = EXCLUDED.normalized_title,
    primary_slug = EXCLUDED.primary_slug,
    search_document = EXCLUDED.search_document,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger on sense_examples (previously missing)
CREATE OR REPLACE FUNCTION synac_refresh_entry_search_from_sense_example() RETURNS trigger AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  SELECT s.entry_id INTO v_entry_id FROM senses s WHERE s.id = COALESCE(NEW.sense_id, OLD.sense_id);
  IF v_entry_id IS NOT NULL THEN
    PERFORM synac_refresh_entry_search(v_entry_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS entry_search_refresh_on_sense_examples ON sense_examples;
CREATE TRIGGER entry_search_refresh_on_sense_examples
AFTER INSERT OR UPDATE OR DELETE ON sense_examples
FOR EACH ROW EXECUTE FUNCTION synac_refresh_entry_search_from_sense_example();

-- 4.1 Meaning-level search index
CREATE TABLE IF NOT EXISTS "sense_search" (
  "sense_id" UUID NOT NULL,
  "entry_id" UUID NOT NULL,
  "entry_type" "EntryType" NOT NULL,
  "entry_slug" TEXT NOT NULL,
  "entry_title" TEXT NOT NULL,
  "sense_slug" TEXT,
  "sense_label" TEXT,
  "expanded_form" TEXT,
  "normalized_label" TEXT NOT NULL,
  "search_document" TEXT NOT NULL,
  "source_names" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sense_search_pkey" PRIMARY KEY ("sense_id"),
  CONSTRAINT "sense_search_sense_id_fkey" FOREIGN KEY ("sense_id") REFERENCES "senses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "sense_search_entry_id_idx" ON "sense_search" ("entry_id");
CREATE INDEX IF NOT EXISTS "sense_search_search_document_tsv_idx" ON "sense_search" USING GIN (to_tsvector('english', "search_document"));
CREATE INDEX IF NOT EXISTS "sense_search_normalized_label_trgm_idx" ON "sense_search" USING GIN ("normalized_label" gin_trgm_ops);

CREATE OR REPLACE FUNCTION synac_refresh_sense_search(target_sense_id uuid) RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  SELECT
    s.id AS sense_id,
    e.id AS entry_id,
    e.entry_type,
    e.primary_slug AS entry_slug,
    e.display_title AS entry_title,
    s.slug AS sense_slug,
    s.sense_label,
    s.expanded_form,
    lower(trim(concat_ws(' ', e.display_title, s.sense_label, s.expanded_form))) AS normalized_label,
    lower(trim(concat_ws(' ',
      e.display_title,
      s.sense_label,
      s.expanded_form,
      coalesce(s.definition_text, ''),
      (SELECT string_agg(sd.definition_text, ' ') FROM sense_definitions sd WHERE sd.sense_id = s.id),
      (SELECT string_agg(ev.variant_text, ' ') FROM entry_variants ev WHERE ev.entry_id = e.id)
    ))) AS search_document,
    (SELECT string_agg(DISTINCT src.name, ', ')
       FROM sense_definitions sd
       JOIN citations c ON c.id = sd.citation_id
       JOIN sources src ON src.id = c.source_id
      WHERE sd.sense_id = s.id) AS source_names
  INTO r
  FROM senses s
  JOIN entries e ON e.id = s.entry_id
  WHERE s.id = target_sense_id
    AND s.deleted_at IS NULL AND s.status = 'PUBLISHED'
    AND e.deleted_at IS NULL AND e.status = 'PUBLISHED';

  IF NOT FOUND THEN
    DELETE FROM sense_search WHERE sense_id = target_sense_id;
    RETURN;
  END IF;

  INSERT INTO sense_search (sense_id, entry_id, entry_type, entry_slug, entry_title, sense_slug, sense_label, expanded_form, normalized_label, search_document, source_names, updated_at)
  VALUES (r.sense_id, r.entry_id, r.entry_type, r.entry_slug, r.entry_title, r.sense_slug, r.sense_label, r.expanded_form, r.normalized_label, r.search_document, r.source_names, NOW())
  ON CONFLICT (sense_id) DO UPDATE SET
    entry_id = EXCLUDED.entry_id,
    entry_type = EXCLUDED.entry_type,
    entry_slug = EXCLUDED.entry_slug,
    entry_title = EXCLUDED.entry_title,
    sense_slug = EXCLUDED.sense_slug,
    sense_label = EXCLUDED.sense_label,
    expanded_form = EXCLUDED.expanded_form,
    normalized_label = EXCLUDED.normalized_label,
    search_document = EXCLUDED.search_document,
    source_names = EXCLUDED.source_names,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION synac_refresh_sense_search_for_entry(target_entry_id uuid) RETURNS void AS $$
BEGIN
  DELETE FROM sense_search ss
  WHERE ss.entry_id = target_entry_id
    AND NOT EXISTS (
      SELECT 1 FROM senses s JOIN entries e ON e.id = s.entry_id
      WHERE s.id = ss.sense_id AND s.deleted_at IS NULL AND s.status = 'PUBLISHED'
        AND e.deleted_at IS NULL AND e.status = 'PUBLISHED'
    );
  PERFORM synac_refresh_sense_search(s.id) FROM senses s WHERE s.entry_id = target_entry_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION synac_refresh_sense_search_from_sense() RETURNS trigger AS $$
BEGIN
  PERFORM synac_refresh_sense_search(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION synac_refresh_sense_search_from_entry() RETURNS trigger AS $$
BEGIN
  PERFORM synac_refresh_sense_search_for_entry(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION synac_refresh_sense_search_from_definition() RETURNS trigger AS $$
BEGIN
  PERFORM synac_refresh_sense_search(COALESCE(NEW.sense_id, OLD.sense_id));
  PERFORM synac_refresh_entry_search(s.entry_id) FROM senses s WHERE s.id = COALESCE(NEW.sense_id, OLD.sense_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION synac_refresh_sense_search_from_variant() RETURNS trigger AS $$
BEGIN
  PERFORM synac_refresh_sense_search_for_entry(COALESCE(NEW.entry_id, OLD.entry_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sense_search_refresh_on_senses ON senses;
CREATE TRIGGER sense_search_refresh_on_senses
AFTER INSERT OR UPDATE OR DELETE ON senses
FOR EACH ROW EXECUTE FUNCTION synac_refresh_sense_search_from_sense();
DROP TRIGGER IF EXISTS sense_search_refresh_on_entries ON entries;
CREATE TRIGGER sense_search_refresh_on_entries
AFTER UPDATE OR DELETE ON entries
FOR EACH ROW EXECUTE FUNCTION synac_refresh_sense_search_from_entry();
DROP TRIGGER IF EXISTS sense_search_refresh_on_sense_definitions ON sense_definitions;
CREATE TRIGGER sense_search_refresh_on_sense_definitions
AFTER INSERT OR UPDATE OR DELETE ON sense_definitions
FOR EACH ROW EXECUTE FUNCTION synac_refresh_sense_search_from_definition();
DROP TRIGGER IF EXISTS sense_search_refresh_on_entry_variants ON entry_variants;
CREATE TRIGGER sense_search_refresh_on_entry_variants
AFTER INSERT OR UPDATE OR DELETE ON entry_variants
FOR EACH ROW EXECUTE FUNCTION synac_refresh_sense_search_from_variant();

-- Backfill both search tables (idempotent)
SELECT synac_refresh_entry_search(id) FROM entries;
SELECT synac_refresh_sense_search(id) FROM senses;
