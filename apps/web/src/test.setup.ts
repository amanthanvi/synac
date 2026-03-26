process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@localhost:5432/synac_test?schema=public';
process.env.NEXT_PUBLIC_SITE_URL ||= 'http://localhost:3000';
process.env.SYNAC_RATE_LIMIT_SALT ||= 'test-rate-limit-salt';
process.env.SYNAC_SESSION_HASH_SALT ||= 'test-session-salt';
