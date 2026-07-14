import { describe, expect, it } from 'vitest';
import {
  generatedBriefSchema,
  interviewAnalysisSchema,
  emptyBriefSections,
} from '../../shared/contracts.js';
import { emptyAssessments } from '../../server/domain/confidence.js';

describe('GPT structured output contracts', () => {
  it('accepts an exact eight-dimension bilingual interview result', () => {
    const result = interviewAnalysisSchema.parse({
      facts: [{ statement: 'ผู้ใช้ต้องอนุมัติก่อน sync', answerIds: ['answer-1'] }],
      assumptions: [],
      contradictions: [],
      dimensionAssessments: emptyAssessments(),
      nextQuestion: {
        text: 'ผลลัพธ์แบบใดจึงถือว่าสำเร็จ?',
        dimension: 'successCriteria',
        rationale: 'ยังไม่มีเกณฑ์วัดผลโดยตรง',
      },
      shouldStop: false,
      stopReason: 'continue',
    });
    expect(result.dimensionAssessments).toHaveLength(8);
  });

  it('rejects malformed, truncated, and extra-field output', () => {
    expect(() =>
      interviewAnalysisSchema.parse({
        facts: [],
        assumptions: [],
        contradictions: [],
        dimensionAssessments: emptyAssessments().slice(0, 7),
        nextQuestion: null,
        shouldStop: true,
        stopReason: 'ready',
      }),
    ).toThrow();
    expect(() =>
      generatedBriefSchema.parse({ title: 'Brief', sections: emptyBriefSections, hidden: 'no' }),
    ).toThrow();
  });
});
