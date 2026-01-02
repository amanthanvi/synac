-- Entry page view tracking for trending (privacy-aware, session-deduped).

CREATE TABLE "entry_views" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "session_hash" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entry_views_entry_id_session_hash_key" ON "entry_views"("entry_id", "session_hash");
CREATE INDEX "entry_views_last_seen_at_idx" ON "entry_views"("last_seen_at");
CREATE INDEX "entry_views_entry_id_idx" ON "entry_views"("entry_id");

ALTER TABLE "entry_views"
ADD CONSTRAINT "entry_views_entry_id_fkey"
FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

