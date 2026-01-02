-- CreateEnum
CREATE TYPE "TakedownCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

-- AlterTable
ALTER TABLE "source_documents" ADD COLUMN     "do_not_use" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "do_not_use_reason" TEXT,
ADD COLUMN     "do_not_use_at" TIMESTAMP(3),
ADD COLUMN     "do_not_use_by_user_id" UUID;

-- CreateTable
CREATE TABLE "takedown_cases" (
    "id" UUID NOT NULL,
    "status" "TakedownCaseStatus" NOT NULL DEFAULT 'OPEN',
    "source_id" UUID,
    "source_document_id" UUID,
    "entry_id" UUID,
    "requester_contact" TEXT,
    "request_text" TEXT NOT NULL,
    "internal_notes" TEXT,
    "actions" JSONB,
    "affected_entity_ids" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "takedown_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "takedown_cases_status_idx" ON "takedown_cases"("status");

-- CreateIndex
CREATE INDEX "takedown_cases_created_at_desc_idx" ON "takedown_cases"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_do_not_use_by_user_id_fkey" FOREIGN KEY ("do_not_use_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takedown_cases" ADD CONSTRAINT "takedown_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takedown_cases" ADD CONSTRAINT "takedown_cases_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takedown_cases" ADD CONSTRAINT "takedown_cases_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takedown_cases" ADD CONSTRAINT "takedown_cases_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

