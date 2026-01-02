-- DropIndex
DROP INDEX "entry_search_normalized_title_trgm_idx";

-- AlterTable
ALTER TABLE "entries" ADD COLUMN     "editorial_notes" TEXT;

-- AlterTable
ALTER TABLE "senses" ADD COLUMN     "editorial_rationale" TEXT,
ADD COLUMN     "is_editorial" BOOLEAN NOT NULL DEFAULT false;
