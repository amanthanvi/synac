type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * What a structured log line may carry. Dates are allowed because `sanitize`
 * converts them; everything else must already be JSON-shaped at the call site.
 */
type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | LogValue[]
  | { [key: string]: LogValue };

type LogFields = { [key: string]: LogValue };

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

function sanitize(value: LogValue, depth: number): LogValue {
  if (depth > 6) return '[Truncated]';
  if (!value) return value;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));

  const out: LogFields = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = shouldRedactKey(k) ? '[REDACTED]' : sanitize(v, depth + 1);
  }
  return out;
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  const entry: LogFields = {
    level,
    time: new Date().toISOString(),
    message,
  };

  for (const [key, value] of Object.entries(fields ?? {})) {
    entry[key] = shouldRedactKey(key) ? '[REDACTED]' : sanitize(value, 1);
  }

  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else if (level === 'debug') console.debug(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (message: string, fields?: LogFields) =>
    write('debug', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: (message: string, fields?: LogFields) => write('warn', message, fields),
  error: (message: string, fields?: LogFields) =>
    write('error', message, fields),
};
