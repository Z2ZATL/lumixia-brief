import { type DimensionAssessment, type InterviewAnalysis } from '../../shared/contracts.js';
import { confidenceScore, essentialDimensions, levelPoints } from '../../shared/confidence.js';
import { dimensionKeys, dimensionLabels, type DimensionKey } from '../../shared/domain.js';

export {
  confidenceScore,
  emptyAssessments,
  essentialDimensions,
  levelPoints,
  lowestPriorityDimension,
} from '../../shared/confidence.js';

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
