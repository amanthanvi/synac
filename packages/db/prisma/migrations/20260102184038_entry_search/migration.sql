-- CreateTable
CREATE TABLE "entry_search" (
    "entry_id" UUID NOT NULL,
    "entry_type" "EntryType" NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "primary_slug" TEXT NOT NULL,
    "search_document" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_search_pkey" PRIMARY KEY ("entry_id")
);

-- CreateIndex
CREATE INDEX "entry_search_entry_type_idx" ON "entry_search"("entry_type");

-- CreateIndex
CREATE INDEX "entry_search_normalized_title_idx" ON "entry_search"("normalized_title");

-- AddForeignKey
ALTER TABLE "entry_search" ADD CONSTRAINT "entry_search_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search indexes
CREATE INDEX "entry_search_search_document_tsv_idx" ON "entry_search" USING GIN (to_tsvector('english', "search_document"));
CREATE INDEX "entry_search_normalized_title_trgm_idx" ON "entry_search" USING GIN ("normalized_title" gin_trgm_ops);

-- Search document maintenance
CREATE OR REPLACE FUNCTION synac_refresh_entry_search(target_entry_id UUID) RETURNS void AS $$
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
    trim(
      concat_ws(
        ' ',
        e.display_title,
        e.summary_text,
        (
          SELECT string_agg(ev.variant_text, ' ' ORDER BY ev.variant_text)
          FROM entry_variants ev
          WHERE ev.entry_id = e.id
        ),
        (
          SELECT string_agg(
            trim(concat_ws(' ', s.expanded_form, s.definition_text)),
            ' ' ORDER BY s.sense_order
          )
          FROM senses s
          WHERE s.entry_id = e.id
            AND s.deleted_at IS NULL
            AND s.status = 'PUBLISHED'
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

CREATE OR REPLACE FUNCTION synac_refresh_entry_search_from_entry() RETURNS trigger AS $$
BEGIN
  PERFORM synac_refresh_entry_search(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION synac_refresh_entry_search_from_sense() RETURNS trigger AS $$
BEGIN
  PERFORM synac_refresh_entry_search(COALESCE(NEW.entry_id, OLD.entry_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION synac_refresh_entry_search_from_variant() RETURNS trigger AS $$
BEGIN
  PERFORM synac_refresh_entry_search(COALESCE(NEW.entry_id, OLD.entry_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entry_search_refresh_on_entries
AFTER INSERT OR UPDATE OR DELETE ON entries
FOR EACH ROW EXECUTE FUNCTION synac_refresh_entry_search_from_entry();

CREATE TRIGGER entry_search_refresh_on_senses
AFTER INSERT OR UPDATE OR DELETE ON senses
FOR EACH ROW EXECUTE FUNCTION synac_refresh_entry_search_from_sense();

CREATE TRIGGER entry_search_refresh_on_entry_variants
AFTER INSERT OR UPDATE OR DELETE ON entry_variants
FOR EACH ROW EXECUTE FUNCTION synac_refresh_entry_search_from_variant();

-- Backfill (idempotent)
SELECT synac_refresh_entry_search(id) FROM entries;
