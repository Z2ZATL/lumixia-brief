export const dimensionKeys = [
  'problem',
  'audience',
  'outcome',
  'scope',
  'constraints',
  'timeline',
  'risks',
  'successCriteria',
] as const;

export const dimensionLevels = ['missing', 'assumed', 'partial', 'clear'] as const;

export type DimensionKey = (typeof dimensionKeys)[number];
export type DimensionLevel = (typeof dimensionLevels)[number];

export const dimensionLabels: Record<DimensionKey, string> = {
  problem: 'Problem',
  audience: 'Audience',
  outcome: 'Outcome',
  scope: 'Scope',
  constraints: 'Constraints',
  timeline: 'Timeline',
  risks: 'Risks',
  successCriteria: 'Success criteria',
};
