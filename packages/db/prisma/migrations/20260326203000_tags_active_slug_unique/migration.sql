-- One non-deleted tag per slug (auto-tag create + concurrent publishes).
CREATE UNIQUE INDEX IF NOT EXISTS tags_slug_active_unique ON tags (slug) WHERE deleted_at IS NULL;
