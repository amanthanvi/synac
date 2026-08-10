import { hashCanonical, seededOrder } from './canonical.ts';
import {
  buildConceptFamilies,
  conceptCollisionSignals,
  resolveEntryReference,
} from './families.ts';
import type {
  ControlRecord,
  ControlSuite,
  FrozenRubric,
  HashedClassificationEntry,
  LoadedReviewedControls,
  PublicAnchorControlRecord,
  ReviewedControlRecord,
  TagId,
} from './types.ts';

type UnsplitPublicControl = Omit<
  PublicAnchorControlRecord,
  'qualificationSplit'
>;
type UnsplitReviewedControl = Omit<ReviewedControlRecord, 'qualificationSplit'>;
type UnsplitControl = UnsplitPublicControl | UnsplitReviewedControl;

const NO_REVIEWED_CONTROLS: LoadedReviewedControls = Object.freeze({
  files: [],
  rows: [],
});

export type ControlFamilyCollision = Readonly<{
  tagId: TagId;
  label: 'applicable' | 'not_applicable';
  familyId: string;
  left: Readonly<{
    entryKey: string;
    controlId: string;
    evidenceKind: ControlRecord['evidenceKind'];
  }>;
  right: Readonly<{
    entryKey: string;
    controlId: string;
    evidenceKind: ControlRecord['evidenceKind'];
  }>;
  basis: readonly string[];
}>;

export function auditControlFamilyCollisions(
  rubric: FrozenRubric,
  entries: readonly HashedClassificationEntry[],
  reviewed: LoadedReviewedControls,
): readonly ControlFamilyCollision[] {
  const families = buildConceptFamilies(entries, new Set());
  const familyByEntryKey = new Map(
    families.flatMap((family) =>
      family.entryKeys.map((entryKey) => [entryKey, family.familyId] as const),
    ),
  );
  const entriesByKey = new Map(
    entries.map((value) => [value.entry.key, value]),
  );
  type Candidate = Readonly<{
    tagId: TagId;
    label: 'applicable' | 'not_applicable';
    entryKey: string;
    controlId: string;
    evidenceKind: ControlRecord['evidenceKind'];
  }>;
  const publicCandidates: Candidate[] = rubric.tags.flatMap((tag) =>
    tag.anchors.map((anchor) => {
      const target = resolveEntryReference(entries, anchor.entryReference);
      return {
        tagId: tag.id,
        label:
          anchor.polarity === 'positive'
            ? ('applicable' as const)
            : ('not_applicable' as const),
        entryKey: target.entry.key,
        controlId: anchor.id,
        evidenceKind: 'public-rubric-anchor' as const,
      };
    }),
  );
  const reviewedCandidates: Candidate[] = reviewed.rows
    .map((loaded) => ({
      tagId: loaded.tagId,
      label:
        loaded.row.polarity === 'positive'
          ? ('applicable' as const)
          : ('not_applicable' as const),
      entryKey: loaded.row.entryKey,
      controlId: hashCanonical({
        schemaVersion: 'synac-reviewed-control-id-v1',
        tagId: loaded.tagId,
        entryKey: loaded.row.entryKey,
        polarity: loaded.row.polarity,
        ruleId: loaded.row.ruleId,
        senseKey: loaded.row.senseKey,
        quote: loaded.row.quote,
      }),
      evidenceKind: 'reviewed-source-evidence' as const,
    }))
    .sort(
      (a, b) =>
        a.tagId.localeCompare(b.tagId) ||
        a.label.localeCompare(b.label) ||
        a.controlId.localeCompare(b.controlId),
    );
  const seen = new Map<string, Candidate[]>();
  const collisions: ControlFamilyCollision[] = [];
  for (const candidate of [...publicCandidates, ...reviewedCandidates]) {
    const familyId = familyByEntryKey.get(candidate.entryKey);
    if (!familyId)
      throw new Error(`control ${candidate.controlId}: missing concept family`);
    const cell = `${candidate.tagId}\0${candidate.label}\0${familyId}`;
    const previous = seen.get(cell) ?? [];
    if (candidate.evidenceKind === 'reviewed-source-evidence') {
      const rightEntry = entriesByKey.get(candidate.entryKey);
      if (!rightEntry)
        throw new Error(
          `reviewed control ${candidate.entryKey}: missing entry`,
        );
      const rightSignals = new Set(conceptCollisionSignals(rightEntry));
      for (const left of previous) {
        const leftEntry = entriesByKey.get(left.entryKey);
        if (!leftEntry)
          throw new Error(`control ${left.entryKey}: missing entry`);
        const basis = conceptCollisionSignals(leftEntry).filter((signal) =>
          rightSignals.has(signal),
        );
        collisions.push({
          tagId: candidate.tagId,
          label: candidate.label,
          familyId,
          left,
          right: candidate,
          basis: basis.length > 0 ? basis : [`transitive-family:${familyId}`],
        });
      }
    }
    previous.push(candidate);
    seen.set(cell, previous);
  }
  return collisions;
}

function controlCell(
  control: Pick<ControlRecord, 'tagId' | 'entryKey'>,
): string {
  return `${control.tagId}\0${control.entryKey}`;
}

function assignQualificationSplits(
  controls: readonly UnsplitControl[],
  seed: string,
  familyByEntryKey: ReadonlyMap<string, string>,
): readonly ControlRecord[] {
  const stratumId = (control: UnsplitControl): string =>
    `${control.tagId}\0${control.label}`;
  const controlsByFamily = new Map<string, UnsplitControl[]>();
  for (const control of controls) {
    const familyId = familyByEntryKey.get(control.entryKey);
    if (!familyId)
      throw new Error(`control ${control.controlId}: missing concept family`);
    const values = controlsByFamily.get(familyId) ?? [];
    values.push(control);
    controlsByFamily.set(familyId, values);
  }

  const strata = [...new Set(controls.map(stratumId))].sort();
  const targets = new Map(
    strata.map((stratum) => {
      const count = controls.filter(
        (control) => stratumId(control) === stratum,
      ).length;
      return [stratum, Math.ceil(count / 2)] as const;
    }),
  );
  const families = [...controlsByFamily.entries()]
    .map(([familyId, values]) => {
      const stratumCounts = new Map<string, number>();
      for (const control of values) {
        const stratum = stratumId(control);
        stratumCounts.set(stratum, (stratumCounts.get(stratum) ?? 0) + 1);
      }
      return {
        familyId,
        controls: values,
        stratumCounts,
        strata: [...stratumCounts.keys()].sort(),
      };
    })
    .sort(
      (a, b) =>
        seededOrder(seed, a.familyId).localeCompare(
          seededOrder(seed, b.familyId),
        ) || a.familyId.localeCompare(b.familyId),
    );
  const single = families.filter((family) => family.controls.length === 1);
  const coupled = families
    .filter((family) => family.controls.length > 1)
    .sort(
      (a, b) =>
        b.strata.length - a.strata.length ||
        seededOrder(seed, a.familyId).localeCompare(
          seededOrder(seed, b.familyId),
        ) ||
        a.familyId.localeCompare(b.familyId),
    );
  const singleCapacity = new Map(
    strata.map((stratum) => [
      stratum,
      single.filter((family) => family.strata[0] === stratum).length,
    ]),
  );
  const selectedCounts = new Map(strata.map((stratum) => [stratum, 0]));
  const selectedCoupled = new Set<string>();
  const memo = new Set<string>();
  const chooseCoupled = (index: number): boolean => {
    for (const stratum of strata) {
      const selected = selectedCounts.get(stratum) ?? 0;
      const target = targets.get(stratum) ?? 0;
      if (selected > target) return false;
      const remaining = coupled
        .slice(index)
        .reduce(
          (sum, family) => sum + (family.stratumCounts.get(stratum) ?? 0),
          0,
        );
      if (selected + remaining + (singleCapacity.get(stratum) ?? 0) < target)
        return false;
    }
    if (index === coupled.length) return true;
    const state = `${index}\0${strata
      .map((stratum) => selectedCounts.get(stratum) ?? 0)
      .join(',')}`;
    if (memo.has(state)) return false;
    const family = coupled[index];
    selectedCoupled.add(family.familyId);
    family.stratumCounts.forEach((count, stratum) =>
      selectedCounts.set(stratum, (selectedCounts.get(stratum) ?? 0) + count),
    );
    if (chooseCoupled(index + 1)) return true;
    family.stratumCounts.forEach((count, stratum) =>
      selectedCounts.set(stratum, (selectedCounts.get(stratum) ?? 0) - count),
    );
    selectedCoupled.delete(family.familyId);
    if (chooseCoupled(index + 1)) return true;
    memo.add(state);
    return false;
  };
  if (!chooseCoupled(0)) {
    throw new Error(
      'cannot assign concept families to exact qualification strata targets',
    );
  }

  const calibrationFamilies = new Set(selectedCoupled);
  for (const stratum of strata) {
    const required =
      (targets.get(stratum) ?? 0) - (selectedCounts.get(stratum) ?? 0);
    const candidates = single.filter((family) => family.strata[0] === stratum);
    if (required < 0 || required > candidates.length) {
      throw new Error(
        `cannot assign exact calibration count for ${stratum.replace('\0', '/')}`,
      );
    }
    candidates
      .slice(0, required)
      .forEach((family) => calibrationFamilies.add(family.familyId));
  }
  return controls.map((control) => {
    const familyId = familyByEntryKey.get(control.entryKey);
    if (!familyId)
      throw new Error(`control ${control.controlId}: missing concept family`);
    const qualificationSplit = calibrationFamilies.has(familyId)
      ? 'calibration'
      : 'validation';
    return { ...control, qualificationSplit } as ControlRecord;
  });
}

export function buildControls(
  rubric: FrozenRubric,
  entries: readonly HashedClassificationEntry[],
  seed: string,
  reviewed: LoadedReviewedControls = NO_REVIEWED_CONTROLS,
): ControlSuite {
  const families = buildConceptFamilies(entries, new Set());
  const familyByEntryKey = new Map(
    families.flatMap((family) =>
      family.entryKeys.map((entryKey) => [entryKey, family.familyId] as const),
    ),
  );
  const unsplitControls: UnsplitControl[] = [];
  const seenCells = new Map<string, string>();
  const add = (control: UnsplitControl): void => {
    const cell = controlCell(control);
    const previous = seenCells.get(cell);
    if (previous) {
      throw new Error(
        `duplicate control cell ${control.tagId}/${control.entryKey}: ${previous} and ${control.controlId}`,
      );
    }
    seenCells.set(cell, control.controlId);
    unsplitControls.push(control);
  };

  for (const tag of rubric.tags) {
    for (const anchor of tag.anchors) {
      const target = resolveEntryReference(entries, anchor.entryReference);
      add({
        controlId: anchor.id,
        tagId: tag.id,
        entryKey: target.entry.key,
        entryHash: target.entryHash,
        label: anchor.polarity === 'positive' ? 'applicable' : 'not_applicable',
        rubricAnchorId: anchor.id,
        evidenceKind: 'public-rubric-anchor',
      });
    }
  }

  const entriesByKey = new Map(
    entries.map((entry) => [entry.entry.key, entry]),
  );
  for (const reviewedControl of reviewed.rows) {
    const target = entriesByKey.get(reviewedControl.row.entryKey);
    if (!target)
      throw new Error(
        `reviewed control ${reviewedControl.row.entryKey}: missing from selected corpus`,
      );
    const controlId = hashCanonical({
      schemaVersion: 'synac-reviewed-control-id-v1',
      tagId: reviewedControl.tagId,
      entryKey: reviewedControl.row.entryKey,
      polarity: reviewedControl.row.polarity,
      ruleId: reviewedControl.row.ruleId,
      senseKey: reviewedControl.row.senseKey,
      quote: reviewedControl.row.quote,
    });
    add({
      controlId,
      tagId: reviewedControl.tagId,
      entryKey: target.entry.key,
      entryHash: target.entryHash,
      label:
        reviewedControl.row.polarity === 'positive'
          ? 'applicable'
          : 'not_applicable',
      ruleId: reviewedControl.row.ruleId,
      senseKey: reviewedControl.row.senseKey,
      quote: reviewedControl.row.quote,
      rationale: reviewedControl.row.rationale,
      primaryReviewer: reviewedControl.row.primaryReviewer,
      secondaryReviewer: reviewedControl.row.secondaryReviewer,
      reviewedFileHash: reviewedControl.fileHash,
      evidenceKind: 'reviewed-source-evidence',
    });
  }

  const perTag = rubric.tags.map((tag) => {
    const positive = unsplitControls.filter(
      (control) => control.tagId === tag.id && control.label === 'applicable',
    ).length;
    const negative = unsplitControls.filter(
      (control) =>
        control.tagId === tag.id && control.label === 'not_applicable',
    ).length;
    if (positive > 30 || negative > 30) {
      throw new Error(
        `${tag.id}: controls exceed 30 per polarity (${positive} positive, ${negative} negative)`,
      );
    }
    return {
      tagId: tag.id,
      positive,
      negative,
      positiveShortfall: Math.max(0, 30 - positive),
      negativeShortfall: Math.max(0, 30 - negative),
      eligible: positive === 30 && negative === 30,
    };
  });
  const controls = [
    ...assignQualificationSplits(unsplitControls, seed, familyByEntryKey),
  ].sort((a, b) => a.controlId.localeCompare(b.controlId));
  const core = {
    schemaVersion: 'synac-source-controls-v1' as const,
    targetCount: 660 as const,
    actualCount: controls.length,
    protocolReady: perTag.every((report) => report.eligible),
    reviewedFiles: [...reviewed.files].sort((a, b) =>
      a.tagId.localeCompare(b.tagId),
    ),
    controls,
    perTag,
  };
  return { ...core, controlHash: hashCanonical(core) };
}

export function controlShortfall(
  suite: ControlSuite,
): Readonly<Record<TagId, number>> {
  return Object.fromEntries(
    suite.perTag.map((report) => [
      report.tagId,
      report.positiveShortfall + report.negativeShortfall,
    ]),
  ) as Readonly<Record<TagId, number>>;
}
