export const TAG_IDS = [
  'T01',
  'T02',
  'T03',
  'T04',
  'T05',
  'T06',
  'T07',
  'T08',
  'T09',
  'T10',
  'T11',
] as const;

export type TagId = (typeof TAG_IDS)[number];
export type Polarity = 'positive' | 'negative';
export type ReferenceSplit =
  | 'development'
  | 'calibration'
  | 'validation'
  | 'audit';
export type SealedRole = 'primary' | 'critic' | 'arbiter' | 'auditor';

export type RubricRule = Readonly<{
  id: string;
  text: string;
}>;

export type RubricAnchor = Readonly<{
  id: string;
  entryReference: string;
  polarity: Polarity;
}>;

export type TagRubric = Readonly<{
  id: TagId;
  slug: string;
  name: string;
  definition: string;
  inclusionRules: readonly RubricRule[];
  exclusionRules: readonly RubricRule[];
  anchors: readonly RubricAnchor[];
}>;

export type FrozenRubric = Readonly<{
  schemaVersion: 'synac-tag-rubric-v2';
  taxonomyVersion: '2';
  protocolVersion: 'synac-ai-adjudication-v1';
  globalRules: readonly RubricRule[];
  tags: readonly TagRubric[];
}>;

export type ClassificationSense = Readonly<{
  key: string;
  order: number;
  label: string | null;
  expandedForm: string | null;
  definitionText: string;
  examples: readonly string[];
  sourceSlugs: readonly string[];
}>;

export type ClassificationEntry = Readonly<{
  key: string;
  entryType: 'TERM' | 'ACRONYM';
  slug: string;
  title: string;
  aliases: readonly string[];
  summaryText: string | null;
  senses: readonly ClassificationSense[];
}>;

export type HashedClassificationEntry = Readonly<{
  entry: ClassificationEntry;
  entryHash: string;
}>;

export type CorpusSnapshot = Readonly<{
  schemaVersion: 'synac-classification-corpus-v1';
  contentVersion: string;
  entries: readonly HashedClassificationEntry[];
  corpusHash: string;
}>;

export type ConceptFamily = Readonly<{
  familyId: string;
  entryKeys: readonly string[];
  forcedDevelopment: boolean;
}>;

export type SplitAssignment = Readonly<{
  familyId: string;
  entryKeys: readonly string[];
  split: ReferenceSplit;
  forcedDevelopment: boolean;
}>;

export type SplitPlan = Readonly<{
  schemaVersion: 'synac-family-split-v1';
  selectionSeed: string;
  capacities: Readonly<Record<ReferenceSplit, number>>;
  counts: Readonly<Record<ReferenceSplit, number>>;
  assignments: readonly SplitAssignment[];
  splitHash: string;
}>;

export type PublicAnchorControlRecord = Readonly<{
  controlId: string;
  tagId: TagId;
  entryKey: string;
  entryHash: string;
  label: 'applicable' | 'not_applicable';
  rubricAnchorId: string;
  evidenceKind: 'public-rubric-anchor';
  qualificationSplit: 'calibration' | 'validation';
}>;

export type ReviewedControlRow = Readonly<{
  entryKey: string;
  polarity: Polarity;
  ruleId: string;
  senseKey: string;
  quote: string;
  rationale: string;
  primaryReviewer: string;
  secondaryReviewer: string;
}>;

export type ReviewedControlFile = Readonly<{
  schemaVersion: 'synac-reviewed-controls-v1';
  tagId: TagId;
  tagSlug: string;
  rows: readonly ReviewedControlRow[];
}>;

export type ReviewedControlFileBinding = Readonly<{
  tagId: TagId;
  tagSlug: string;
  fileName: string;
  fileHash: string;
  rowCount: number;
}>;

export type LoadedReviewedControl = Readonly<{
  tagId: TagId;
  tagSlug: string;
  fileHash: string;
  row: ReviewedControlRow;
}>;

export type LoadedReviewedControls = Readonly<{
  files: readonly ReviewedControlFileBinding[];
  rows: readonly LoadedReviewedControl[];
}>;

export type ReviewedControlRecord = Readonly<{
  controlId: string;
  tagId: TagId;
  entryKey: string;
  entryHash: string;
  label: 'applicable' | 'not_applicable';
  ruleId: string;
  senseKey: string;
  quote: string;
  rationale: string;
  primaryReviewer: string;
  secondaryReviewer: string;
  reviewedFileHash: string;
  evidenceKind: 'reviewed-source-evidence';
  qualificationSplit: 'calibration' | 'validation';
}>;

export type ControlRecord = PublicAnchorControlRecord | ReviewedControlRecord;

export type ControlTagReport = Readonly<{
  tagId: TagId;
  positive: number;
  negative: number;
  positiveShortfall: number;
  negativeShortfall: number;
  eligible: boolean;
}>;

export type ControlSuite = Readonly<{
  schemaVersion: 'synac-source-controls-v1';
  targetCount: 660;
  actualCount: number;
  protocolReady: boolean;
  reviewedFiles: readonly ReviewedControlFileBinding[];
  controls: readonly ControlRecord[];
  perTag: readonly ControlTagReport[];
  controlHash: string;
}>;

export type InjectionPacket = Readonly<{
  packetId: string;
  tagId: TagId;
  attackClass:
    | 'instruction'
    | 'label-solicitation'
    | 'fabricated-peer-verdict'
    | 'universal-scoring';
  untrustedText: string;
  expectedHandling: Readonly<{
    ignoreInstruction: true;
    injectionSuspected: true;
  }>;
}>;

export type InjectionSuite = Readonly<{
  schemaVersion: 'synac-injection-packets-v1';
  packets: readonly InjectionPacket[];
  packetHash: string;
}>;

export type ModelLane = Readonly<{
  lane: 'P1' | 'P2' | 'P3' | 'P4' | 'A1' | 'A2' | 'C+' | 'C-';
  trainingOrganization: string;
  baseModelFamily: string;
  ancestry: string;
  provider: string;
  immutableModelId: string;
  backendFingerprint: string;
  openWeights: boolean;
  weightsHash: string | null;
}>;

export type ModelLineages = Readonly<{
  schemaVersion: 'synac-model-lineages-v1';
  lanes: readonly ModelLane[];
}>;

export type RuntimeConfig = Readonly<{
  schemaVersion: 'synac-runtime-config-v1';
  runId: string;
  frozenAt: string;
  temperature: 0;
  seed: number;
  tokenLimit: number;
  tools: false;
  candidates: 1;
}>;

export type RunManifest = Readonly<{
  schemaVersion: 'synac-reference-manifest-v1';
  protocolVersion: 'synac-ai-adjudication-v1';
  runId: string;
  frozenAt: string;
  entryCount: 1500;
  tagIds: readonly TagId[];
  hashes: Readonly<{
    corpus: string;
    rubric: string;
    split: string;
    controls: string;
    injectionPackets: string;
    code: string;
    runtime: string;
    models: string;
  }>;
  masterSeed: string;
  controlsReady: boolean;
  manifestHash: string;
}>;

export type EvidenceSpan = Readonly<{
  field: 'title' | 'summaryText' | 'definition';
  senseKey: string | null;
  start: number;
  end: number;
}>;

export type ClassificationDecision = Readonly<{
  tag_id: TagId;
  verdict: 'yes' | 'no' | 'abstain';
  p_applicable: number;
  rule_ids: readonly string[];
  evidence: readonly EvidenceSpan[];
  counterevidence: string;
}>;

export type ClassificationResponse = Readonly<{
  entry_hash: string;
  rubric_hash: string;
  seal_id: string;
  injection_suspected: boolean;
  decisions: readonly ClassificationDecision[];
}>;
