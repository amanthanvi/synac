import { getEntry, getCollection } from 'astro:content';

const CANONICAL_BASE = 'https://synac.app';

export async function getStaticPaths() {
  const terms = await getCollection('terms');
  return terms.map((t) => ({ params: { id: t.slug } }));
}

export const prerender = true;

export async function GET({ params }: { params: { id?: string } }) {
  const id = params.id;
  if (!id) {
    return new Response('Missing id', { status: 400 });
  }
  const entry = await getEntry('terms', id);
  if (!entry) {
    return new Response('Not found', { status: 404 });
  }

  const data = entry.data as any;

  const url = `${CANONICAL_BASE}/terms/${id}`;
  const inDefinedTermSet = `${CANONICAL_BASE}/terms`;
  const sameAs =
    Array.isArray(data.seeAlso) && data.seeAlso.length
      ? data.seeAlso.map((sid: string) => `${CANONICAL_BASE}/terms/${sid}`)
      : undefined;

  // Map sources to subjectOf where applicable
  const subjectOf =
    Array.isArray(data.sources) && data.sources.length
      ? data.sources
          .filter((s: any) => s?.url)
          .map((s: any) => ({
            '@type': 'CreativeWork',
            name: s.citation || undefined,
            url: s.url,
          }))
      : undefined;

  // Optionally include identifiers from mappings
  const identifiers: any[] = [];
  if (data?.mappings?.attack?.techniqueIds?.length) {
    for (const tid of data.mappings.attack.techniqueIds) {
      identifiers.push({ '@type': 'PropertyValue', propertyID: 'ATTACK', value: tid });
    }
  }
  if (data?.mappings?.cweIds?.length) {
    for (const cid of data.mappings.cweIds) {
      identifiers.push({ '@type': 'PropertyValue', propertyID: 'CWE', value: cid });
    }
  }
  if (data?.mappings?.capecIds?.length) {
    for (const cid of data.mappings.capecIds) {
      identifiers.push({ '@type': 'PropertyValue', propertyID: 'CAPEC', value: cid });
    }
  }

  const jsonld: any = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: data.term,
    termCode: id,
    description: data.summary,
    url,
    inDefinedTermSet,
    alternateName:
      Array.isArray(data.acronym) && data.acronym.length ? data.acronym.join(', ') : undefined,
    sameAs,
    subjectOf: subjectOf && subjectOf.length ? subjectOf : undefined,
    identifier: identifiers.length ? identifiers : undefined,
    dateModified: data.updatedAt,
  };

  // Remove undefined fields
  Object.keys(jsonld).forEach((k) => jsonld[k] === undefined && delete jsonld[k]);

  return new Response(JSON.stringify(jsonld, null, 2), {
    headers: {
      'content-type': 'application/ld+json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
