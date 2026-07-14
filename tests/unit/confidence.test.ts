import { describe, expect, it } from 'vitest';
import type { DimensionAssessment, InterviewAnalysis } from '../../shared/contracts.js';
import {
  confidenceScore,
  emptyAssessments,
  isReadyToBrief,
  lowestPriorityDimension,
} from '../../server/domain/confidence.js';

function withLevels(levels: DimensionAssessment['level'][]): DimensionAssessment[] {
  return emptyAssessments().map((item, index) => ({ ...item, level: levels[index] ?? 'missing' }));
}

function analysis(assessments: DimensionAssessment[]): InterviewAnalysis {
  return {
    facts: [],
    assumptions: [],
    contradictions: [],
    dimensionAssessments: assessments,
    nextQuestion: null,
    shouldStop: false,
    stopReason: 'continue',
  };
}

describe('confidence rubric', () => {
  it('computes server-owned score as sum divided by 24', () => {
    expect(
      confidenceScore(
        withLevels(['clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'missing', 'missing']),
      ),
    ).toBe(75);
    expect(confidenceScore(emptyAssessments())).toBe(0);
  });

  it('requires five answers, 75%, essential dimensions partial, and no blocker', () => {
    const assessments = withLevels([
      'clear',
      'clear',
      'clear',
      'clear',
      'partial',
      'partial',
      'partial',
      'clear',
    ]);
    const state = analysis(assessments);
    expect(isReadyToBrief(state, 4)).toBe(false);
    expect(isReadyToBrief(state, 5)).toBe(true);
    state.contradictions.push({
      id: 'c1',
      statementA: 'A',
      statementB: 'B',
      answerIds: ['a'],
      blocking: true,
      resolved: false,
      resolution: null,
    });
    expect(isReadyToBrief(state, 5)).toBe(false);
  });

  it('prioritizes a missing essential dimension over an optional tie', () => {
    const assessments = withLevels([
      'clear',
      'missing',
      'clear',
      'clear',
      'missing',
      'missing',
      'missing',
      'clear',
    ]);
    expect(lowestPriorityDimension(assessments)).toBe('audience');
  });
});
