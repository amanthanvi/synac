import MiniSearch from 'minisearch';

export type SearchDoc = {
  id: string;
  term: string;
  acronym?: string[];
  aliases?: string[];
  text: string;
  tags: string[];
  sourceKinds: string[];
};

export const searchOptions = {
  idField: 'id',
  fields: ['term', 'acronym', 'aliases', 'text', 'tags', 'sourceKinds'],
  storeFields: ['id', 'term', 'acronym', 'aliases', 'tags', 'sourceKinds'],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: { term: 2, acronym: 2, aliases: 1.5 },
  },
} as const;

/**
 * Build a MiniSearch index payload given normalized docs.
 * Returns the options and a serialized index JSON that can be revived on the client via MiniSearch.loadJSON.
 */
export function buildIndexPayload(docs: SearchDoc[]) {
  const mini = new MiniSearch(searchOptions as any);
  mini.addAll(docs);
  return {
    options: searchOptions,
    index: JSON.stringify(mini.toJSON()),
  };
}
