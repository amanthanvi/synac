import { formatDate, toIsoString, type DateLike } from './publicFormat';

export type SenseCitationInput = {
  entryTitle: string;
  entrySlug: string;
  senseLabel: string;
  senseSlug: string | null;
  senseId: string;
  url: string;
  sourceNames: string[];
  accessedAt: DateLike | null;
};

type SenseCitationStrings = {
  bibtex: string;
  plain: string;
  /** Machine-readable record served by the API, linked from the disclosure. */
  jsonHref: string;
};

function bibtexKey(input: SenseCitationInput): string {
  const raw = `synac-${input.entrySlug}-${input.senseSlug ?? input.senseId}`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-');
}

/** BibTeX has no escape for `{`/`}`/`\`; the safest handling is to drop them. */
function bibtexValue(value: string): string {
  return value
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinNames(names: string[]): string {
  const unique = Array.from(
    new Set(names.map((name) => name.trim()).filter(Boolean)),
  );
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0] ?? '';
  const last = unique[unique.length - 1] ?? '';
  return `${unique.slice(0, -1).join(', ')} and ${last}`;
}

/** BibTeX and plain-text citation strings for a single sense. */
export function buildSenseCitationStrings(
  input: SenseCitationInput,
): SenseCitationStrings {
  const title = bibtexValue(`${input.entryTitle} — ${input.senseLabel}`);
  const sources = joinNames(input.sourceNames);
  const accessedLabel = input.accessedAt ? formatDate(input.accessedAt) : null;
  const accessedIso = input.accessedAt
    ? toIsoString(input.accessedAt).slice(0, 10)
    : null;

  const noteParts = [
    sources ? `Sources: ${bibtexValue(sources)}` : null,
    accessedLabel ? `Accessed ${accessedLabel}` : null,
  ].filter((part): part is string => Boolean(part));

  const fields: Array<[string, string]> = [
    ['title', `{${title}}`],
    ['howpublished', '{SynAc — cybersecurity glossary}'],
    ['url', `{${input.url}}`],
  ];

  if (accessedIso) fields.push(['urldate', `{${accessedIso}}`]);
  if (noteParts.length) fields.push(['note', `{${noteParts.join('. ')}}`]);

  const bibtex = [
    `@misc{${bibtexKey(input)},`,
    ...fields.map(([key, value]) => `  ${key.padEnd(12)} = ${value},`),
    '}',
  ].join('\n');

  const plainParts = [
    `${input.entryTitle} — ${input.senseLabel}.`,
    'SynAc.',
    sources ? `Sources: ${sources}.` : null,
    accessedLabel ? `Accessed ${accessedLabel}.` : null,
    input.url,
  ].filter((part): part is string => Boolean(part));

  return {
    bibtex,
    plain: plainParts.join(' '),
    jsonHref: `/api/v1/senses/${input.senseId}/citation.json`,
  };
}
