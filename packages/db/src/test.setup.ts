process.env.DATABASE_URL ||=
  'postgresql://postgres:postgres@localhost:5432/synac_test?schema=public';
process.env.SYNAC_STAGING_DATABASE_URL ||=
  'postgresql://postgres:postgres@localhost:5432/synac_staging_test?schema=public';
