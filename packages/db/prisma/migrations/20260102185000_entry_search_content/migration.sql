-- Update EntrySearch document composition to include Markdown + examples.

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
          coalesce(e.summary_md, ''),
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
                  s.expanded_form,
                  coalesce(s.definition_text, ''),
                  coalesce(s.definition_md, ''),
                  (
                    SELECT string_agg(
                      trim(coalesce(se.example_text, se.example_md)),
                      ' ' ORDER BY se.example_order
                    )
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

-- Backfill (idempotent)
SELECT synac_refresh_entry_search(id) FROM entries;

