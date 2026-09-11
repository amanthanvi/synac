/**
 * Audit snapshots are stored as Prisma JSON. A `JSON.parse(JSON.stringify(x))`
 * round trip lies about the type, since it silently turns every `Date` into a
 * string. `toJsonSafe` does the conversion explicitly and reports it in the
 * type, so snapshots typecheck against Prisma's JSON input without a cast.
 */

export type JsonSafe<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Array<JsonSafe<U>>
    : T extends readonly (infer U)[]
      ? ReadonlyArray<JsonSafe<U>>
      : T extends object
        ? { [K in keyof T]: JsonSafe<T[K]> }
        : T;

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();

  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean')
    return value;
  // A bigint has no JSON representation; a decimal string is the lossless one.
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) return value.map(convert);

  if (kind === 'object') {
    // Prisma.Decimal and friends expose `toJSON`; honour it rather than walking
    // their internals.
    const maybe = value as { toJSON?: () => unknown };
    if (typeof maybe.toJSON === 'function') return convert(maybe.toJSON());

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      out[key] = convert(item);
    }
    return out;
  }

  // Only `symbol` and `function` reach here and neither is JSON. Record the
  // kind rather than stringifying, which would spill function source into
  // an audit row.
  return `[${kind}]`;
}

export function toJsonSafe<T>(value: T): JsonSafe<T> {
  // `convert` walks every branch of `JsonSafe`: dates become ISO strings,
  // arrays and plain objects are rebuilt element-wise, everything else is
  // already a JSON primitive.
  return convert(value) as JsonSafe<T>;
}
