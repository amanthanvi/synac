import { getCollection } from 'astro:content';
import { buildIndexPayload } from '../lib/searchBuild';
declare const __BUILD_TIME__: string | number;

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
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
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

  return new Response(JSON.stringify({ v: __BUILD_TIME__, ...payload }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
