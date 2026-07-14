import type { DimensionAssessment } from './contracts.js';
import {
  dimensionKeys,
  dimensionLabels,
  type DimensionKey,
  type DimensionLevel,
} from './domain.js';

export const levelPoints: Record<DimensionLevel, number> = {
  missing: 0,
  assumed: 1,
  partial: 2,
  clear: 3,
};

export const essentialDimensions: DimensionKey[] = [
  'problem',
  'audience',
  'outcome',
  'scope',
  'successCriteria',
];

export function emptyAssessments(): DimensionAssessment[] {
  return dimensionKeys.map((dimension) => ({
    dimension,
    level: 'missing',
    rationale: `${dimensionLabels[dimension]} has not been established yet.`,
    evidence: [],
  }));
}

function normalizeAssessments(
  assessments: ReadonlyArray<DimensionAssessment | null | undefined>,
): DimensionAssessment[] {
  const byDimension = new Map<DimensionKey, DimensionAssessment>();
  for (const assessment of assessments) {
    if (
      assessment &&
      dimensionKeys.includes(assessment.dimension) &&
      Object.hasOwn(levelPoints, assessment.level)
    ) {
      byDimension.set(assessment.dimension, assessment);
    }
  }
  return dimensionKeys.map(
    (dimension) =>
      byDimension.get(dimension) ?? {
        dimension,
        level: 'missing',
        rationale: `${dimensionLabels[dimension]} has not been established yet.`,
        evidence: [],
      },
  );
}

export function confidenceScore(
  assessments: ReadonlyArray<DimensionAssessment | null | undefined>,
): number {
  const normalized = normalizeAssessments(assessments);
  const earned = normalized.reduce((total, item) => total + levelPoints[item.level], 0);
  return Math.round((earned / 24) * 100);
}

export function lowestPriorityDimension(
  assessments: ReadonlyArray<DimensionAssessment | null | undefined>,
): DimensionKey {
  const normalized = normalizeAssessments(assessments);
  const sorted = [...normalized].sort((a, b) => {
    const pointDifference = levelPoints[a.level] - levelPoints[b.level];
    if (pointDifference !== 0) return pointDifference;
    const essentialDifference =
      Number(!essentialDimensions.includes(a.dimension)) -
      Number(!essentialDimensions.includes(b.dimension));
    if (essentialDifference !== 0) return essentialDifference;
    return dimensionKeys.indexOf(a.dimension) - dimensionKeys.indexOf(b.dimension);
  });
  return sorted[0]?.dimension ?? 'problem';
}
