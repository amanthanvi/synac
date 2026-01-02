-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_buckets_scope_key_window_start_key" ON "rate_limit_buckets"("scope", "key", "window_start");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_scope_idx" ON "rate_limit_buckets"("scope");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_window_start_idx" ON "rate_limit_buckets"("window_start");

