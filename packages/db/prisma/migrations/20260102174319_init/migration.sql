-- Extensions
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('TERM', 'ACRONYM');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VariantType" AS ENUM ('ALIAS', 'SYNONYM', 'ABBREVIATION', 'MISSPELLING');

-- CreateEnum
CREATE TYPE "SenseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('RELATED', 'BROADER_THAN', 'NARROWER_THAN', 'OFTEN_CONFUSED_WITH', 'SEE_ALSO');

-- CreateEnum
CREATE TYPE "SourceAccessMethod" AS ENUM ('API', 'RSS', 'HTML', 'PDF', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceRobotsPolicy" AS ENUM ('RESPECT', 'EXPLICIT_PERMISSION');

-- CreateEnum
CREATE TYPE "SourceTrustTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('PUBLIC_DOMAIN', 'CC_BY_4_0', 'CC_BY_SA_4_0', 'CC0_1_0', 'PROPRIETARY', 'OTHER');

-- CreateEnum
CREATE TYPE "IngestRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "IngestTriggeredBy" AS ENUM ('CRON', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "IngestStage" AS ENUM ('EXTRACTED', 'NORMALIZED', 'DEDUPED', 'ENRICHED', 'VALIDATED', 'REVIEWED', 'APPLIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "LicenseGate" AS ENUM ('PASS', 'WARN', 'FAIL');

-- CreateEnum
CREATE TYPE "FieldProvenanceEntityType" AS ENUM ('ENTRY', 'SENSE', 'EXAMPLE', 'RELATIONSHIP', 'TAG');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('API', 'RSS', 'HTML', 'PDF', 'MANUAL');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('OIDC', 'LOCAL');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "entries" (
    "id" UUID NOT NULL,
    "entry_type" "EntryType" NOT NULL,
    "display_title" TEXT NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "primary_slug" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL,
    "summary_md" TEXT,
    "summary_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_slug_history" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "entry_type" "EntryType" NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_slug_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_variants" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "variant_text" TEXT NOT NULL,
    "normalized_variant" TEXT NOT NULL,
    "variant_type" "VariantType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senses" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "sense_order" INTEGER NOT NULL,
    "sense_label" TEXT,
    "definition_md" TEXT,
    "definition_text" TEXT,
    "expanded_form" TEXT,
    "origin_language" TEXT,
    "temporal_context" TEXT,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "status" "SenseStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "senses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sense_examples" (
    "id" UUID NOT NULL,
    "sense_id" UUID NOT NULL,
    "example_md" TEXT,
    "example_text" TEXT,
    "example_order" INTEGER NOT NULL,

    CONSTRAINT "sense_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_slug_history" (
    "id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_slug_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_tags" (
    "entry_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "entry_tags_pkey" PRIMARY KEY ("entry_id","tag_id")
);

-- CreateTable
CREATE TABLE "entry_relationships" (
    "id" UUID NOT NULL,
    "from_entry_id" UUID NOT NULL,
    "to_entry_id" UUID NOT NULL,
    "relationship_type" "RelationshipType" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "entry_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "source_slug" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "license_type" "LicenseType" NOT NULL,
    "license_notes" TEXT,
    "allowed_use" TEXT NOT NULL,
    "attribution_requirements" TEXT NOT NULL,
    "access_method" "SourceAccessMethod" NOT NULL,
    "robots_policy" "SourceRobotsPolicy" NOT NULL,
    "rate_limit_policy" JSONB,
    "contact" TEXT,
    "last_verified_at" TIMESTAMP(3),
    "trust_tier" "SourceTrustTier" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "notes_internal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_documents" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "canonical_url" TEXT,
    "title" TEXT,
    "content_type" TEXT NOT NULL,
    "etag" TEXT,
    "last_modified" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "snapshot_storage_uri" TEXT,
    "snapshot_allowed" BOOLEAN NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citations" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "source_document_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "citation_text" TEXT,
    "license_note" TEXT,
    "attribution_text" TEXT,
    "accessed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_provenance" (
    "id" UUID NOT NULL,
    "entity_type" "FieldProvenanceEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "field_name" TEXT NOT NULL,
    "citation_id" UUID NOT NULL,
    "extraction_method" "ExtractionMethod" NOT NULL,
    "extractor_version" TEXT NOT NULL,
    "extracted_at" TIMESTAMP(3) NOT NULL,
    "source_locator" JSONB,

    CONSTRAINT "field_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_runs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" "IngestRunStatus" NOT NULL,
    "triggered_by" "IngestTriggeredBy" NOT NULL,
    "triggered_by_user_id" UUID,
    "config_snapshot" JSONB,
    "stats" JSONB,

    CONSTRAINT "ingest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_items" (
    "id" UUID NOT NULL,
    "ingest_run_id" UUID NOT NULL,
    "source_document_id" UUID NOT NULL,
    "item_key" TEXT,
    "stage" "IngestStage" NOT NULL,
    "proposed_change" JSONB,
    "diff" JSONB,
    "confidence_score" DOUBLE PRECISION,
    "license_gate" "LicenseGate" NOT NULL,
    "error" TEXT,

    CONSTRAINT "ingest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "display_name" TEXT,
    "auth_provider" "AuthProvider" NOT NULL DEFAULT 'OIDC',
    "provider_subject" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,
    "ip_hash" TEXT,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entries_entry_type_primary_slug_idx" ON "entries"("entry_type", "primary_slug");

-- CreateIndex
CREATE INDEX "entries_entry_type_normalized_title_idx" ON "entries"("entry_type", "normalized_title");

-- CreateIndex
CREATE INDEX "entries_updated_at_idx" ON "entries"("updated_at");

-- CreateIndex
CREATE INDEX "entry_slug_history_entry_id_idx" ON "entry_slug_history"("entry_id");

-- CreateIndex
CREATE INDEX "entry_slug_history_entry_type_slug_idx" ON "entry_slug_history"("entry_type", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "entry_slug_history_entry_id_slug_key" ON "entry_slug_history"("entry_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "entry_slug_history_entry_type_slug_key" ON "entry_slug_history"("entry_type", "slug");

-- CreateIndex
CREATE INDEX "entry_variants_normalized_variant_idx" ON "entry_variants"("normalized_variant");

-- CreateIndex
CREATE UNIQUE INDEX "entry_variants_entry_id_normalized_variant_variant_type_key" ON "entry_variants"("entry_id", "normalized_variant", "variant_type");

-- CreateIndex
CREATE INDEX "senses_entry_id_sense_order_idx" ON "senses"("entry_id", "sense_order");

-- CreateIndex
CREATE INDEX "senses_status_idx" ON "senses"("status");

-- CreateIndex
CREATE INDEX "sense_examples_sense_id_example_order_idx" ON "sense_examples"("sense_id", "example_order");

-- CreateIndex
CREATE INDEX "tags_slug_idx" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "tag_slug_history_slug_idx" ON "tag_slug_history"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tag_slug_history_tag_id_slug_key" ON "tag_slug_history"("tag_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "tag_slug_history_slug_key" ON "tag_slug_history"("slug");

-- CreateIndex
CREATE INDEX "entry_tags_tag_id_idx" ON "entry_tags"("tag_id");

-- CreateIndex
CREATE INDEX "entry_relationships_to_entry_id_idx" ON "entry_relationships"("to_entry_id");

-- CreateIndex
CREATE INDEX "entry_relationships_from_entry_id_idx" ON "entry_relationships"("from_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "sources_source_slug_key" ON "sources"("source_slug");

-- CreateIndex
CREATE INDEX "source_documents_source_id_idx" ON "source_documents"("source_id");

-- CreateIndex
CREATE INDEX "source_documents_url_idx" ON "source_documents"("url");

-- CreateIndex
CREATE UNIQUE INDEX "source_documents_source_id_url_content_sha256_key" ON "source_documents"("source_id", "url", "content_sha256");

-- CreateIndex
CREATE INDEX "citations_source_id_idx" ON "citations"("source_id");

-- CreateIndex
CREATE INDEX "citations_source_document_id_idx" ON "citations"("source_document_id");

-- CreateIndex
CREATE INDEX "field_provenance_entity_type_entity_id_idx" ON "field_provenance"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "field_provenance_citation_id_idx" ON "field_provenance"("citation_id");

-- CreateIndex
CREATE INDEX "ingest_runs_source_id_started_at_idx" ON "ingest_runs"("source_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "ingest_items_ingest_run_id_stage_idx" ON "ingest_items"("ingest_run_id", "stage");

-- CreateIndex
CREATE INDEX "ingest_items_source_document_id_idx" ON "ingest_items"("source_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at" DESC);

-- Partial unique indexes (soft delete aware)
CREATE UNIQUE INDEX "entries_entry_type_primary_slug_active_key"
ON "entries"("entry_type", "primary_slug")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "entries_entry_type_normalized_title_active_key"
ON "entries"("entry_type", "normalized_title")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "tags_slug_active_key"
ON "tags"("slug")
WHERE "deleted_at" IS NULL;

-- Constraints (data integrity)
ALTER TABLE "entry_relationships"
ADD CONSTRAINT "entry_relationships_no_self_links"
CHECK ("from_entry_id" <> "to_entry_id");

CREATE UNIQUE INDEX "entry_relationships_from_to_type_active_key"
ON "entry_relationships"("from_entry_id", "to_entry_id", "relationship_type")
WHERE "deleted_at" IS NULL;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_slug_history" ADD CONSTRAINT "entry_slug_history_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_variants" ADD CONSTRAINT "entry_variants_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "senses" ADD CONSTRAINT "senses_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sense_examples" ADD CONSTRAINT "sense_examples_sense_id_fkey" FOREIGN KEY ("sense_id") REFERENCES "senses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_slug_history" ADD CONSTRAINT "tag_slug_history_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_relationships" ADD CONSTRAINT "entry_relationships_from_entry_id_fkey" FOREIGN KEY ("from_entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_relationships" ADD CONSTRAINT "entry_relationships_to_entry_id_fkey" FOREIGN KEY ("to_entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_relationships" ADD CONSTRAINT "entry_relationships_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_provenance" ADD CONSTRAINT "field_provenance_citation_id_fkey" FOREIGN KEY ("citation_id") REFERENCES "citations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_ingest_run_id_fkey" FOREIGN KEY ("ingest_run_id") REFERENCES "ingest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
