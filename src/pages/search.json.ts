import { getCollection } from 'astro:content';
import { buildIndexPayload } from '../lib/searchBuild';

export const prerender = true;

type Doc = {
  id: string;
  term: string;
  acronym?: string[];
  aliases?: string[];
  text: string;
  tags: string[];
  sourceKinds: string[];
};

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export async function GET() {
  const entries = await getCollection('terms');

  const docs: Doc[] = entries.map((e) => {
    const data = e.data as any;
    const sourceKinds = unique<string>(
      (data.sources || []).map((s: any) => String(s.kind || 'OTHER')),
    );
    return {
      id: e.slug,
      term: data.term,
      acronym: data.acronym,
      aliases: data.aliases,
      text: [
        data.summary,
        ...(data.sources || []).map((s: any) => `${s.citation || ''} ${s.excerpt || ''}`),
      ]
        .filter(Boolean)
        .join(' '),
      tags: data.tags || [],
      sourceKinds,
    };
  });

  const payload = buildIndexPayload(docs as any);
<<<<<<< HEAD
  const responsePayload = { ...payload, docs };

  return new Response(JSON.stringify(responsePayload), {
=======

  return new Response(JSON.stringify(payload), {
>>>>>>> 3597186 (merge: resolve conflicts\n\n- Keep builder-based search.json (buildIndexPayload, no docs in payload)\n- Keep extracted client search script (safe DOM, fallbacks, shared searchOptions)\n- Keep offline E2E with documentation and default skip for CI determinism)
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
