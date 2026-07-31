import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { ZodType } from 'zod';

import {
  bundleFileSchema,
  overrideFileSchema,
  redirectsFileSchema,
  sourceFileSchema,
  tagsFileSchema,
  type EntryType,
  type OverrideFile,
} from './model.js';
import type { ContentInput } from './compile.js';
import { entryKey } from './compile.js';

export type LoadResult =
  | { ok: true; input: ContentInput }
  | { ok: false; errors: string[] };

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    return names.filter((name) => name.endsWith('.json')).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function parseJsonFile<T>(filePath: string, schema: ZodType<T>, errors: string[]): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    errors.push(`${filePath}: cannot read file`);
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    errors.push(`${filePath}: invalid JSON — ${(error as Error).message}`);
    return undefined;
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${filePath}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    return undefined;
  }
  return parsed.data;
}

/** Loads and schema-validates everything under a content/ directory. */
export async function loadContentDir(contentDir: string): Promise<LoadResult> {
  const errors: string[] = [];

  const sources = [];
  for (const name of await listJsonFiles(path.join(contentDir, 'sources'))) {
    const filePath = path.join(contentDir, 'sources', name);
    const parsed = await parseJsonFile(filePath, sourceFileSchema, errors);
    if (!parsed) continue;
    if (`${parsed.slug}.json` !== name) {
      errors.push(`${filePath}: slug ${parsed.slug} does not match file name`);
      continue;
    }
    sources.push(parsed);
  }

  const tags = (await parseJsonFile(path.join(contentDir, 'tags.json'), tagsFileSchema, errors)) ?? { tags: [] };
  const redirects =
    (await parseJsonFile(path.join(contentDir, 'redirects.json'), redirectsFileSchema, errors)) ?? { redirects: [] };

  const bundles = [];
  for (const name of await listJsonFiles(path.join(contentDir, 'generated'))) {
    const filePath = path.join(contentDir, 'generated', name);
    const parsed = await parseJsonFile(filePath, bundleFileSchema, errors);
    if (!parsed) continue;
    if (`${parsed.source}.json` !== name) {
      errors.push(`${filePath}: source ${parsed.source} does not match file name`);
      continue;
    }
    bundles.push(parsed);
  }

  const overrides = new Map<string, OverrideFile>();
  for (const entryType of ['TERM', 'ACRONYM'] as EntryType[]) {
    const dirName = entryType === 'TERM' ? 'term' : 'acronym';
    for (const name of await listJsonFiles(path.join(contentDir, 'overrides', dirName))) {
      const filePath = path.join(contentDir, 'overrides', dirName, name);
      const parsed = await parseJsonFile(filePath, overrideFileSchema, errors);
      if (!parsed) continue;
      overrides.set(entryKey(entryType, name.replace(/\.json$/, '')), parsed);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, input: { sources, tags, redirects, bundles, overrides } };
}
