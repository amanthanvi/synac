import { bundleFileSchema, type BundleFile, type SourceFile } from '@synac/content-tools';

export type DraftDocument = BundleFile['documents'][number];
export type DraftEntry = Omit<BundleFile['entries'][number], 'updatedAt'>;

export type AdapterContext = {
  source: SourceFile;
  previous: BundleFile | null;
  maxItems: number;
  now: Date;
};

export type Adapter = (ctx: AdapterContext) => Promise<BundleFile>;

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val as unknown;
  });
}

/**
 * Assembles a deterministic bundle:
 * - entries sorted by (type, slug), senses kept in adapter order
 * - each entry's updatedAt is preserved from the previous bundle when its
 *   content is unchanged, so re-runs only produce diffs for real changes
 * - if nothing changed at all, the previous bundle is returned byte-identical
 *   (generatedAt/fetchedAt included) so the ingest workflow opens no PR
 */
export function finalizeBundle(input: {
  source: SourceFile;
  adapterVersion: string;
  documents: DraftDocument[];
  entries: DraftEntry[];
  previous: BundleFile | null;
  now: Date;
}): BundleFile {
  const today = input.now.toISOString().slice(0, 10);
  const previousEntries = new Map(
    (input.previous?.entries ?? []).map((entry) => [`${entry.entryType}:${entry.slug}`, entry]),
  );

  const entries = [...input.entries]
    .sort((a, b) => a.entryType.localeCompare(b.entryType) || a.slug.localeCompare(b.slug))
    .map((entry) => {
      const previous = previousEntries.get(`${entry.entryType}:${entry.slug}`);
      const unchanged =
        previous && stableStringify({ ...previous, updatedAt: undefined }) === stableStringify(entry);
      return { ...entry, updatedAt: unchanged ? previous.updatedAt : today };
    });

  const bundle: BundleFile = bundleFileSchema.parse({
    schemaVersion: 1,
    source: input.source.slug,
    generatedAt: input.now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    adapterVersion: input.adapterVersion,
    documents: [...input.documents].sort((a, b) => a.key.localeCompare(b.key)),
    entries,
  });

  // Byte-identical short-circuit: ignore run timestamps when comparing.
  if (input.previous) {
    const normalize = (b: BundleFile) =>
      stableStringify({
        ...b,
        generatedAt: undefined,
        documents: b.documents.map((doc) => ({ ...doc, fetchedAt: undefined })),
      });
    if (normalize(input.previous) === normalize(bundle)) return input.previous;
  }

  return bundle;
}
