export type ProposedSense = {
  senseLabel?: string;
  expandedForm?: string;
  definitionMd: string;
  contentMode?: string;
  extractionMethod?: string;
  extractorVersion?: string;
  sourceLocator?: unknown;
};

export type ProposedVariant = {
  variantText: string;
  variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' | 'MISSPELLING';
};

export type ProposedChangeCreateEntry = {
  kind: 'CREATE_ENTRY';
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  primarySlug?: string;
  summaryMd: string;
  variants?: ProposedVariant[];
  senses: ProposedSense[];
};

export type ProposedChangeAddSenses = {
  kind: 'ADD_SENSES';
  entryId: string;
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  summaryMd?: string;
  variants?: ProposedVariant[];
  senses: ProposedSense[];
};

export type ProposedChange = ProposedChangeCreateEntry | ProposedChangeAddSenses;

function parseEntryType(value: unknown): 'TERM' | 'ACRONYM' {
  return value === 'ACRONYM' ? 'ACRONYM' : 'TERM';
}

function parseVariantType(value: unknown): ProposedVariant['variantType'] {
  if (value === 'SYNONYM' || value === 'ABBREVIATION' || value === 'MISSPELLING') return value;
  return 'ALIAS';
}

function parseSenses(value: unknown): ProposedSense[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : null))
    .filter((s): s is Record<string, unknown> => Boolean(s))
    .map((s) => ({
      senseLabel: typeof s.senseLabel === 'string' ? s.senseLabel : undefined,
      expandedForm: typeof s.expandedForm === 'string' ? s.expandedForm : undefined,
      definitionMd: typeof s.definitionMd === 'string' ? s.definitionMd : '',
      contentMode: typeof s.contentMode === 'string' ? s.contentMode : undefined,
      extractionMethod: typeof s.extractionMethod === 'string' ? s.extractionMethod : undefined,
      extractorVersion: typeof s.extractorVersion === 'string' ? s.extractorVersion : undefined,
      sourceLocator: s.sourceLocator,
    }));
}

function parseVariants(value: unknown): ProposedVariant[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      variantText: typeof v.variantText === 'string' ? v.variantText : '',
      variantType: parseVariantType(v.variantType),
    }))
    .map((v) => ({ ...v, variantText: v.variantText.trim() }))
    .filter((v) => Boolean(v.variantText));
}

export function parseProposedChange(value: unknown): ProposedChange {
  if (!value || typeof value !== 'object') throw new Error('Invalid proposedChange');
  const v = value as Record<string, unknown>;
  if (v.kind !== 'CREATE_ENTRY' && v.kind !== 'ADD_SENSES') throw new Error('Unsupported proposedChange.kind');

  const entryType = parseEntryType(v.entryType);
  const displayTitle = typeof v.displayTitle === 'string' ? v.displayTitle : '';
  const primarySlug = typeof v.primarySlug === 'string' ? v.primarySlug : undefined;
  const summaryMd = typeof v.summaryMd === 'string' ? v.summaryMd : '';
  const senses = parseSenses(v.senses);
  const variants = parseVariants(v.variants);

  if (v.kind === 'ADD_SENSES') {
    const entryId = typeof v.entryId === 'string' ? v.entryId : '';
    return {
      kind: 'ADD_SENSES',
      entryId,
      entryType,
      displayTitle,
      summaryMd: summaryMd || undefined,
      ...(variants.length ? { variants } : {}),
      senses,
    };
  }

  return {
    kind: 'CREATE_ENTRY',
    entryType,
    displayTitle,
    primarySlug,
    summaryMd,
    ...(variants.length ? { variants } : {}),
    senses,
  };
}

export function parseExtractionMethod(value: string | undefined): 'API' | 'RSS' | 'HTML' | 'PDF' | 'MANUAL' {
  const v = value?.toUpperCase();
  if (v === 'API' || v === 'RSS' || v === 'HTML' || v === 'PDF' || v === 'MANUAL') return v;
  return 'MANUAL';
}

export function parseContentMode(value: string | undefined): 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED' {
  const v = value?.toUpperCase();
  if (v === 'QUOTED' || v === 'SUMMARIZED' || v === 'PARAPHRASED') return v;
  return 'SUMMARIZED';
}
