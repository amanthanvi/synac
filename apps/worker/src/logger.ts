type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACT_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'secret',
  'password',
  'session',
  'database_url',
];

function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase();
  return REDACT_KEYS.some((needle) => k.includes(needle));
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated]';
  if (!value) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedactKey(k) ? '[REDACTED]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(fields ? (sanitize(fields) as Record<string, unknown>) : {}),
  };

  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else if (level === 'debug') console.debug(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};

