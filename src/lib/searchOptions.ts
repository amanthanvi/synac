import type {} from 'minisearch';

/**
 * Shared MiniSearch options used on both server (index build) and client (query).
 * This module contains NO server-only imports to keep client bundle lean.
 */
export const searchOptions = {
  idField: 'id',
  // Fields participating in search scoring
  fields: [
    'slugTokens', // highest boost: exact id/slug tokens
    'titleTokens', // high boost: title tokens
    'acronym', // high-ish boost: acronym
    'aliasTokens', // medium: canonical alias tokens
    'text', // lower: summary/body excerpt
    'tags', // lower: tags
  ],
  // Fields returned on each hit (keep minimal to control payload size)
  // Include derived token fields to align with buildIndexPayload enrichment
  storeFields: [
    'id',
    'term',
    'acronym',
    'tags',
    'sourceKinds',
    'typeCategory',
    'aliasTokens',
    'slugTokens',
    'titleTokens',
  ],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: {
      slugTokens: 3.0,
      titleTokens: 2.5,
      acronym: 2.2,
      aliasTokens: 1.8,
      text: 1.0,
      tags: 1.0,
    },
  },
} as const;
