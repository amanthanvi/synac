import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type InputJsonValue = JsonValue;
export type InputJsonObject = JsonObject;

export type EntryType = 'TERM' | 'ACRONYM';
export type RoleName = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type DbTransactionClient = ConvexDataClient;
export type DbClientLike = ConvexDataClient;

type OperationArgs = Record<string, unknown>;
type ModelName =
  | 'entry'
  | 'entrySearch'
  | 'entryView'
  | 'entrySlugHistory'
  | 'entryVariant'
  | 'sense'
  | 'senseExample'
  | 'tag'
  | 'tagSlugHistory'
  | 'entryTag'
  | 'entryRelationship'
  | 'source'
  | 'sourceDocument'
  | 'citation'
  | 'fieldProvenance'
  | 'ingestRun'
  | 'ingestItem'
  | 'user'
  | 'role'
  | 'userRole'
  | 'auditEvent'
  | 'takedownCase'
  | 'rateLimitBucket';

type QueryRef = FunctionReference<'query', 'public', { model: string; args?: unknown; adminKey?: string | null }, unknown>;
type MutationRef = FunctionReference<'mutation', 'public', { model: string; args: unknown; adminKey?: string | null }, unknown>;
type LooseRow = {
  id: string;
  [key: string]: unknown;
  _count: Record<string, number> & { entryTags: number; id: number; entryId: number };
  _max: Record<string, Date | null> & { accessedAt: Date | null };
  accessMethod: string;
  action: string;
  allowedUse: string;
  attributionRequirements: string;
  attributionText: string | null;
  accessedAt: Date;
  actions: JsonValue | null;
  after: JsonValue | null;
  actorUser: LooseRow;
  affectedEntityIds: JsonValue | null;
  baseUrl: string;
  before: JsonValue | null;
  canonicalUrl: string | null;
  citation: LooseRow;
  citationText: string | null;
  closedAt: Date | null;
  configSnapshot: JsonValue | null;
  contact: string | null;
  contentMode: 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED';
  count: number;
  createdAt: Date;
  createdByUser: LooseRow;
  cronSchedule: string | null;
  definitionMd: string | null;
  definitionText: string | null;
  deletedAt: Date | null;
  description: string | null;
  displayTitle: string;
  doNotUse: boolean;
  doNotUseAt: Date | null;
  doNotUseReason: string | null;
  editoralNotes: string | null;
  editorialNotes: string | null;
  editorialRationale: string | null;
  email: string;
  enabled: boolean;
  entry: LooseRow;
  entryId: string;
  entryTags: Array<{ tagId: string; tag: { id: string; name: string; slug: string } }>;
  entryType: EntryType;
  entityId: string;
  entityType: string;
  error: string | null;
  exampleMd: string | null;
  exampleOrder: number;
  exampleText: string | null;
  examples: LooseRow[];
  expandedForm: string | null;
  fieldName: string;
  fetchedAt: Date;
  finishedAt: Date | null;
  ingestRun: LooseRow;
  internalNotes: string | null;
  isEditorial: boolean;
  isPreferred: boolean;
  items: LooseRow[];
  itemKey: string | null;
  lastVerifiedAt: Date | null;
  licenseGate: string;
  licenseGateReason: string | null;
  licenseType: string;
  licenseNote: string | null;
  licenseNotes: string | null;
  name: string;
  normalizedTitle: string;
  notesInternal: string | null;
  primarySlug: string;
  proposedChange: JsonValue | null;
  publishedAt: Date | null;
  rateLimitPolicy: JsonValue | null;
  requestId: string | null;
  requesterContact: string | null;
  requestText: string;
  robotsPolicy: string;
  roles: Array<{ role: { id: string; name: RoleName } }>;
  senseLabel: string | null;
  senseOrder: number;
  senses: LooseRow[];
  slug: string;
  slugHistory: LooseRow[];
  source: LooseRow;
  sourceDocument: LooseRow;
  sourceDocumentId: string;
  sourceId: string;
  sourceLocator: JsonValue | null;
  sourceSlug: string;
  stage: string;
  stageOutputs: JsonValue | null;
  startedAt: Date;
  status: string;
  summaryMd: string | null;
  summaryText: string | null;
  tag: { id: string; name: string; slug: string };
  tagId: string;
  title: string | null;
  trustTier: string;
  updatedAt: Date;
  url: string;
  variantText: string;
  variants: Array<{ variantText: string }>;
  windowStart: Date;
};

const refs = {
  findMany: makeFunctionReference<'query', { model: string; args?: unknown }, unknown>('data:findMany') as QueryRef,
  findFirst: makeFunctionReference<'query', { model: string; args?: unknown }, unknown>('data:findFirst') as QueryRef,
  count: makeFunctionReference<'query', { model: string; args?: unknown }, unknown>('data:count') as QueryRef,
  groupBy: makeFunctionReference<'query', { model: string; args?: unknown }, unknown>('data:groupBy') as QueryRef,
  create: makeFunctionReference<'mutation', { model: string; args: unknown; adminKey?: string | null }, unknown>('data:create') as MutationRef,
  createMany: makeFunctionReference<'mutation', { model: string; args: unknown; adminKey?: string | null }, unknown>('data:createMany') as MutationRef,
  update: makeFunctionReference<'mutation', { model: string; args: unknown; adminKey?: string | null }, unknown>('data:update') as MutationRef,
  updateMany: makeFunctionReference<'mutation', { model: string; args: unknown; adminKey?: string | null }, unknown>('data:updateMany') as MutationRef,
  deleteMany: makeFunctionReference<'mutation', { model: string; args: unknown; adminKey?: string | null }, unknown>('data:deleteMany') as MutationRef,
  upsert: makeFunctionReference<'mutation', { model: string; args: unknown; adminKey?: string | null }, unknown>('data:upsert') as MutationRef,
};

const publicRefs = {
  resolvePublishedEntryBySlug: makeFunctionReference<'query', { entryType: string; slug: string }, unknown>(
    'data:resolvePublishedEntryBySlug',
  ),
  listRecentPublishedEntries: makeFunctionReference<
    'query',
    { page: number; pageSize: number; entryType?: string | null },
    unknown
  >('data:listRecentPublishedEntries'),
  listEntryTagsForEntries: makeFunctionReference<'query', { entryIds: string[] }, unknown>('data:listEntryTagsForEntries'),
  resolveTagBySlug: makeFunctionReference<'query', { slug: string }, unknown>('data:resolveTagBySlug'),
  listTagsWithCounts: makeFunctionReference<'query', Record<string, never>, unknown>('data:listTagsWithCounts'),
  listPublishedEntriesForTag: makeFunctionReference<
    'query',
    { tagId: string; entryType?: string | null; page: number; pageSize: number },
    unknown
  >('data:listPublishedEntriesForTag'),
  getPublicEntryPage: makeFunctionReference<'query', { entryId: string; relationshipLimit: number }, unknown>(
    'data:getPublicEntryPage',
  ),
  loadBrowsePageData: makeFunctionReference<
    'query',
    { entryType: string; letter: string; page: number; pageSize: number; sort: string; query: string; rawTag: string },
    unknown
  >('data:loadBrowsePageData'),
  listPublicSources: makeFunctionReference<'query', Record<string, never>, unknown>('data:listPublicSources'),
  listPublicSourcesWithStats: makeFunctionReference<'query', Record<string, never>, unknown>('data:listPublicSourcesWithStats'),
  resolvePublicSourceBySlug: makeFunctionReference<'query', { slug: string }, unknown>('data:resolvePublicSourceBySlug'),
  listCitedEntriesForSource: makeFunctionReference<
    'query',
    { sourceId: string; page: number; pageSize: number },
    unknown
  >('data:listCitedEntriesForSource'),
  listSitemapEntries: makeFunctionReference<'query', { entryType: string }, unknown>('data:listSitemapEntries'),
  listSitemapTags: makeFunctionReference<'query', Record<string, never>, unknown>('data:listSitemapTags'),
  listSitemapSources: makeFunctionReference<'query', Record<string, never>, unknown>('data:listSitemapSources'),
};

const rateLimitRef = makeFunctionReference<
  'mutation',
  { scope: string; key: string; windowStart: number },
  { count: number }
>('data:hitRateLimit');

const trackPublishedEntryViewRef = makeFunctionReference<
  'mutation',
  { entryId: string; sessionHash: string; nowMs: number; minIntervalMs: number },
  unknown
>('data:trackPublishedEntryView');

const searchRef = makeFunctionReference<
  'query',
  { query: string; entryType?: string | null; tagSlug?: string | null; page: number; pageSize: number },
  unknown
>('data:searchPublishedEntries');

const rebuildSearchRef = makeFunctionReference<'mutation', { adminKey?: string | null }, unknown>('data:rebuildSearchIndex');

const ingestCreateManualRunRef = makeFunctionReference<
  'mutation',
  { actorUserId: string; sourceId: string; maxItems: number; forceReprocess: boolean; adminKey?: string | null },
  { ingestRunId: string }
>('ingest:createManualRun');

function convexUrl(): string {
  const url =
    process.env.CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_DEPLOYMENT_URL;
  if (!url) {
    throw new Error('CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required');
  }
  return url;
}

function genericWriteAdminKey(): string | null {
  return process.env.SYNAC_CONVEX_ADMIN_KEY ?? null;
}

function genericReadAdminKey(): string | null {
  return process.env.SYNAC_CONVEX_ADMIN_KEY ?? null;
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map(serialize);
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child === undefined) continue;
    out[key] = serialize(child);
  }
  return out;
}

const dateKeyPattern = /(?:At|Date|windowStart)$/;

function deserialize(value: unknown, keyHint = ''): unknown {
  if (Array.isArray(value)) return value.map((child) => deserialize(child));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'number' && dateKeyPattern.test(keyHint)) return new Date(value);
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = deserialize(child, key);
  }
  return out;
}

function normalizeModelResult<T>(value: unknown): T {
  return deserialize(value) as T;
}

class ConvexModelClient {
  constructor(
    private readonly db: ConvexDataClient,
    private readonly model: ModelName,
  ) {}

  async findMany<T = LooseRow>(args: OperationArgs = {}): Promise<T[]> {
    return normalizeModelResult<T[]>(
      await this.db.query(refs.findMany, { model: this.model, args: serialize(args), adminKey: genericReadAdminKey() }),
    );
  }

  async findFirst<T = LooseRow>(args: OperationArgs = {}): Promise<T | null> {
    return normalizeModelResult<T | null>(
      await this.db.query(refs.findFirst, { model: this.model, args: serialize(args), adminKey: genericReadAdminKey() }),
    );
  }

  async findUnique<T = LooseRow>(args: OperationArgs = {}): Promise<T | null> {
    return this.findFirst<T>(args);
  }

  async findFirstOrThrow<T = LooseRow>(args: OperationArgs = {}): Promise<T> {
    const row = await this.findFirst<T>(args);
    if (!row) throw new Error(`${this.model} not found`);
    return row;
  }

  async findUniqueOrThrow<T = LooseRow>(args: OperationArgs = {}): Promise<T> {
    return this.findFirstOrThrow<T>(args);
  }

  async count(args: OperationArgs = {}): Promise<number> {
    return normalizeModelResult<number>(
      await this.db.query(refs.count, { model: this.model, args: serialize(args), adminKey: genericReadAdminKey() }),
    );
  }

  async groupBy<T = LooseRow>(args: OperationArgs = {}): Promise<T[]> {
    return normalizeModelResult<T[]>(
      await this.db.query(refs.groupBy, { model: this.model, args: serialize(args), adminKey: genericReadAdminKey() }),
    );
  }

  async create<T = LooseRow>(args: OperationArgs): Promise<T> {
    return normalizeModelResult<T>(
      await this.db.mutation(refs.create, { model: this.model, args: serialize(args), adminKey: genericWriteAdminKey() }),
    );
  }

  async createMany(args: OperationArgs): Promise<{ count: number }> {
    return normalizeModelResult<{ count: number }>(
      await this.db.mutation(refs.createMany, { model: this.model, args: serialize(args), adminKey: genericWriteAdminKey() }),
    );
  }

  async update<T = LooseRow>(args: OperationArgs): Promise<T> {
    return normalizeModelResult<T>(
      await this.db.mutation(refs.update, { model: this.model, args: serialize(args), adminKey: genericWriteAdminKey() }),
    );
  }

  async updateMany(args: OperationArgs): Promise<{ count: number }> {
    return normalizeModelResult<{ count: number }>(
      await this.db.mutation(refs.updateMany, { model: this.model, args: serialize(args), adminKey: genericWriteAdminKey() }),
    );
  }

  async deleteMany(args: OperationArgs): Promise<{ count: number }> {
    return normalizeModelResult<{ count: number }>(
      await this.db.mutation(refs.deleteMany, { model: this.model, args: serialize(args), adminKey: genericWriteAdminKey() }),
    );
  }

  async upsert<T = LooseRow>(args: OperationArgs): Promise<T> {
    return normalizeModelResult<T>(
      await this.db.mutation(refs.upsert, { model: this.model, args: serialize(args), adminKey: genericWriteAdminKey() }),
    );
  }
}

export class ConvexDataClient {
  private readonly client: ConvexHttpClient;

  readonly entry = new ConvexModelClient(this, 'entry');
  readonly entrySearch = new ConvexModelClient(this, 'entrySearch');
  readonly entryView = new ConvexModelClient(this, 'entryView');
  readonly entrySlugHistory = new ConvexModelClient(this, 'entrySlugHistory');
  readonly entryVariant = new ConvexModelClient(this, 'entryVariant');
  readonly sense = new ConvexModelClient(this, 'sense');
  readonly senseExample = new ConvexModelClient(this, 'senseExample');
  readonly tag = new ConvexModelClient(this, 'tag');
  readonly tagSlugHistory = new ConvexModelClient(this, 'tagSlugHistory');
  readonly entryTag = new ConvexModelClient(this, 'entryTag');
  readonly entryRelationship = new ConvexModelClient(this, 'entryRelationship');
  readonly source = new ConvexModelClient(this, 'source');
  readonly sourceDocument = new ConvexModelClient(this, 'sourceDocument');
  readonly citation = new ConvexModelClient(this, 'citation');
  readonly fieldProvenance = new ConvexModelClient(this, 'fieldProvenance');
  readonly ingestRun = new ConvexModelClient(this, 'ingestRun');
  readonly ingestItem = new ConvexModelClient(this, 'ingestItem');
  readonly user = new ConvexModelClient(this, 'user');
  readonly role = new ConvexModelClient(this, 'role');
  readonly userRole = new ConvexModelClient(this, 'userRole');
  readonly auditEvent = new ConvexModelClient(this, 'auditEvent');
  readonly takedownCase = new ConvexModelClient(this, 'takedownCase');
  readonly rateLimitBucket = new ConvexModelClient(this, 'rateLimitBucket');

  constructor(url = convexUrl()) {
    this.client = new ConvexHttpClient(url);
  }

  async query<T>(ref: FunctionReference<'query'>, args: Record<string, unknown>): Promise<T> {
    return this.client.query(ref, args) as Promise<T>;
  }

  async mutation<T>(ref: FunctionReference<'mutation'>, args: Record<string, unknown>): Promise<T> {
    return this.client.mutation(ref, args) as Promise<T>;
  }

  async $transaction<T>(fn: (tx: ConvexDataClient) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async $disconnect(): Promise<void> {}

  async $queryRaw<T = unknown[]>(...args: unknown[]): Promise<T> {
    void args;
    return [] as T;
  }

  async $executeRaw(...args: unknown[]): Promise<number> {
    void args;
    return 0;
  }

  async $executeRawUnsafe(...args: unknown[]): Promise<number> {
    void args;
    return 0;
  }
}

type GlobalForConvex = typeof globalThis & {
  __synacConvexData?: ConvexDataClient;
};

export function createPrismaClient(databaseUrl?: string): ConvexDataClient {
  void databaseUrl;
  return new ConvexDataClient();
}

export function getPrismaClientForUrl(databaseUrl?: string): ConvexDataClient {
  void databaseUrl;
  return getPrismaClient();
}

export function getPrismaClient(): ConvexDataClient {
  const globalForConvex = globalThis as GlobalForConvex;
  if (process.env.NODE_ENV !== 'production' && globalForConvex.__synacConvexData) {
    return globalForConvex.__synacConvexData;
  }
  const client = new ConvexDataClient();
  if (process.env.NODE_ENV !== 'production') globalForConvex.__synacConvexData = client;
  return client;
}

export async function withTransaction<T>(fn: (tx: DbTransactionClient) => Promise<T>): Promise<T> {
  return getPrismaClient().$transaction(fn);
}

export async function queryPublicConvex<T>(name: keyof typeof publicRefs, args: Record<string, unknown> = {}): Promise<T> {
  return normalizeModelResult<T>(await getPrismaClient().query(publicRefs[name], args));
}

export async function hitConvexRateLimit(input: {
  scope: string;
  key: string;
  windowStart: Date;
}): Promise<{ count: number }> {
  return normalizeModelResult<{ count: number }>(
    await getPrismaClient().mutation(rateLimitRef, {
      scope: input.scope,
      key: input.key,
      windowStart: input.windowStart.getTime(),
    }),
  );
}

export async function trackPublishedEntryView(input: {
  entryId: string;
  sessionHash: string;
  now: Date;
  minIntervalMs: number;
}): Promise<unknown> {
  return normalizeModelResult<unknown>(
    await getPrismaClient().mutation(trackPublishedEntryViewRef, {
      entryId: input.entryId,
      sessionHash: input.sessionHash,
      nowMs: input.now.getTime(),
      minIntervalMs: input.minIntervalMs,
    }),
  );
}

export async function searchConvexEntries(input: {
  query: string;
  entryType?: EntryType;
  tagSlug?: string;
  page: number;
  pageSize: number;
}): Promise<unknown[]> {
  return normalizeModelResult<unknown[]>(
    await getPrismaClient().query(searchRef, {
      query: input.query,
      entryType: input.entryType ?? null,
      tagSlug: input.tagSlug ?? null,
      page: input.page,
      pageSize: input.pageSize,
    }),
  );
}

export async function rebuildConvexSearchIndex(): Promise<unknown> {
  return getPrismaClient().mutation(rebuildSearchRef, { adminKey: genericWriteAdminKey() });
}

export async function createConvexIngestRun(input: {
  actorUserId: string;
  sourceId: string;
  maxItems: number;
  forceReprocess: boolean;
}): Promise<{ ingestRunId: string }> {
  return getPrismaClient().mutation(ingestCreateManualRunRef, { ...input, adminKey: genericWriteAdminKey() });
}

export { ConvexDataClient as PrismaClient };
