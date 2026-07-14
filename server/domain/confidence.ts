import {
  dimensionKeys,
  dimensionLabels,
  type DimensionAssessment,
  type DimensionKey,
  type DimensionLevel,
  type InterviewAnalysis,
} from '../../shared/contracts.js';

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

export function normalizeAssessments(assessments: DimensionAssessment[]): DimensionAssessment[] {
  const byDimension = new Map(assessments.map((assessment) => [assessment.dimension, assessment]));
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

export function confidenceScore(assessments: DimensionAssessment[]): number {
  const normalized = normalizeAssessments(assessments);
  const earned = normalized.reduce((total, item) => total + levelPoints[item.level], 0);
  return Math.round((earned / 24) * 100);
}

export function blockingContradictions(analysis: InterviewAnalysis) {
  return analysis.contradictions.filter((item) => item.blocking && !item.resolved);
}

export function isReadyToBrief(analysis: InterviewAnalysis, answerCount: number): boolean {
  if (answerCount < 5 || confidenceScore(analysis.dimensionAssessments) < 75) return false;
  if (blockingContradictions(analysis).length > 0) return false;

  const levels = new Map(
    analysis.dimensionAssessments.map((assessment) => [assessment.dimension, assessment.level]),
  );
  return essentialDimensions.every(
    (dimension) => levelPoints[levels.get(dimension) ?? 'missing'] >= 2,
  );
}

export function assessInitialPrompt(prompt: string): DimensionAssessment[] {
  const normalized = prompt.toLowerCase();
  const markers: Record<DimensionKey, RegExp> = {
    problem: /problem|pain|issue|challenge|ปัญหา|ติดขัด|ต้องการแก้/,
    audience: /user|customer|audience|founder|team|ผู้ใช้|ลูกค้า|กลุ่มเป้าหมาย/,
    outcome: /outcome|result|goal|deliver|ผลลัพธ์|เป้าหมาย|ต้องการให้/,
    scope: /feature|scope|page|flow|must|ฟีเจอร์|ขอบเขต|ต้องมี/,
    constraints: /constraint|budget|limit|security|ข้อจำกัด|งบ|ความปลอดภัย/,
    timeline: /timeline|deadline|day|week|month|วันที่|เวลา|สัปดาห์|เดือน/,
    risks: /risk|avoid|concern|failure|ความเสี่ยง|ระวัง|ล้มเหลว/,
    successCriteria: /success|metric|kpi|measure|สำเร็จ|ตัวชี้วัด|วัดผล/,
  };

  return dimensionKeys.map((dimension) => {
    const matched = markers[dimension].test(normalized);
    return {
      dimension,
      level: matched ? 'partial' : 'missing',
      rationale: matched
        ? `The initial prompt mentions ${dimensionLabels[dimension]} but has not been validated.`
        : `The initial prompt does not establish ${dimensionLabels[dimension]}.`,
      evidence: matched ? [{ answerId: 'initial-prompt', excerpt: prompt.slice(0, 240) }] : [],
    };
  });
}

export function lowestPriorityDimension(assessments: DimensionAssessment[]): DimensionKey {
  const normalized = normalizeAssessments(assessments);
  return [...normalized].sort((a, b) => {
    const pointDifference = levelPoints[a.level] - levelPoints[b.level];
    if (pointDifference !== 0) return pointDifference;
    const essentialDifference =
      Number(!essentialDimensions.includes(a.dimension)) -
      Number(!essentialDimensions.includes(b.dimension));
    if (essentialDifference !== 0) return essentialDifference;
    return dimensionKeys.indexOf(a.dimension) - dimensionKeys.indexOf(b.dimension);
  })[0].dimension;
}
