type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * What a log field may carry. Restricted to values that survive
 * `JSON.stringify` unchanged, so a log line is always machine-readable and
 * redaction only has to look at top-level keys.
 */
type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly LogValue[];

export type LogFields = Readonly<Record<string, LogValue>>;

const REDACT_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'secret',
  'password',
  'session',
  'clerk_secret_key',
];

function shouldRedactKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return REDACT_KEYS.some((needle) => lowered.includes(needle));
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  const entry: Record<string, LogValue> = {
    level,
    time: new Date().toISOString(),
    message,
  };

  for (const [key, value] of Object.entries(fields ?? {})) {
    entry[key] = shouldRedactKey(key) ? '[REDACTED]' : value;
  }

  const line = JSON.stringify(entry);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields) =>
    write('debug', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: (message: string, fields?: LogFields) => write('warn', message, fields),
  error: (message: string, fields?: LogFields) =>
    write('error', message, fields),
};
