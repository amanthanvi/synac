-- Postgres bootstrap for local development and CI.
--
-- Executed once by the `postgres` image entrypoint (mounted into
-- /docker-entrypoint-initdb.d) against the POSTGRES_DB database as the
-- superuser, so it may create databases and extensions.
--
--   synac                 development database
--   synac_test            integration tests (TRUNCATED by the test harness)
--   synac_staging_test    staging-first ingest/promotion tests
--   synac_shadow          empty scratch DB for Prisma shadow + drift checks
--
-- The initial Prisma migration also creates `pg_trgm` and `citext`; creating
-- them here means a non-superuser app role can still run migrations.

SELECT 'CREATE DATABASE synac'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'synac')\gexec

SELECT 'CREATE DATABASE synac_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'synac_test')\gexec

SELECT 'CREATE DATABASE synac_staging_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'synac_staging_test')\gexec

-- Intentionally left EMPTY: `db:migrate:drift` resets this database.
SELECT 'CREATE DATABASE synac_shadow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'synac_shadow')\gexec

\connect synac
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

\connect synac_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

\connect synac_staging_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
