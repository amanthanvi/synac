import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { sourceFileSchema, type SourceFile } from '@synac/content-tools';

export type IngestableSource = SourceFile & {
  ingest: NonNullable<SourceFile['ingest']>;
};

/** A source is ingested only when it is enabled and names an adapter. */
export function isIngestable(source: SourceFile): source is IngestableSource {
  return source.enabled && source.ingest !== undefined;
}

/** Parses every `content/sources/*.json` file, sorted by slug. */
export async function loadSourceRegistry(
  contentDir: string,
): Promise<SourceFile[]> {
  const dir = path.join(contentDir, 'sources');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) =>
      sourceFileSchema.parse(
        JSON.parse(await readFile(path.join(dir, file), 'utf8')),
      ),
    ),
  );
}

/**
 * Slugs the scheduled workflow fans out over, one job each. A requested slug
 * narrows the list to that source and must be ingestable, so a mistyped
 * workflow_dispatch input fails up front instead of producing an empty run.
 */
export function selectIngestSources(
  registry: readonly SourceFile[],
  requested?: string,
): string[] {
  const slugs = registry
    .filter(isIngestable)
    .map((source) => source.slug)
    .sort();
  if (requested === undefined) return slugs;
  if (!slugs.includes(requested)) {
    const known = registry.some((source) => source.slug === requested);
    throw new Error(
      known
        ? `${requested}: source is not enabled for ingest`
        : `${requested}: no source registry file`,
    );
  }
  return [requested];
}
