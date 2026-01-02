-- CreateEnum
CREATE TYPE "ContentMode" AS ENUM ('QUOTED', 'SUMMARIZED', 'PARAPHRASED');

-- AlterTable
ALTER TABLE "field_provenance" ADD COLUMN     "content_mode" "ContentMode" NOT NULL DEFAULT 'SUMMARIZED';

-- AlterTable
ALTER TABLE "ingest_items" ADD COLUMN     "stage_outputs" JSONB,
ADD COLUMN     "license_gate_reason" TEXT;

