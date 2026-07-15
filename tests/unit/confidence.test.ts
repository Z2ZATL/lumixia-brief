import { describe, expect, it } from 'vitest';
import type { DimensionAssessment, InterviewAnalysis } from '../../shared/contracts.js';
import {
  confidenceScore,
  emptyAssessments,
  isReadyToBrief,
  lowestPriorityDimension,
} from '../../server/domain/confidence.js';
import {
  chooseNextQuestion,
  enforceStopRules,
  initialQuestion,
} from '../../server/domain/interview.js';

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

function allClearLevels(): DimensionAssessment['level'][] {
  return Array.from({ length: 8 }, () => 'clear' as const);
}

describe('confidence rubric', () => {
  it('computes server-owned score as sum divided by 24', () => {
    expect(
      confidenceScore(
        withLevels(['clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'missing', 'missing']),
      ),
    ).toBe(75);
    expect(confidenceScore(emptyAssessments())).toBe(0);
    expect(confidenceScore([undefined, null])).toBe(0);
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

  it('provides localized initial questions and resolves blocking contradictions first', () => {
    expect(initialQuestion('en')).toMatchObject({ dimension: 'problem' });
    expect(initialQuestion('th')).toMatchObject({ dimension: 'problem' });
    const state = analysis(withLevels(allClearLevels().map(() => 'partial')));
    state.contradictions.push({
      id: 'conflict',
      statementA: 'Launch this week',
      statementB: 'Research for one month',
      answerIds: ['answer-a', 'answer-b'],
      blocking: true,
      resolved: false,
      resolution: null,
    });
    expect(chooseNextQuestion(state, 5)).toMatchObject({
      dimension: 'scope',
      rationale: 'A blocking contradiction must be resolved before adding more scope.',
    });
  });

  it('uses the model question only when it targets the highest-priority gap', () => {
    const state = analysis(withLevels(allClearLevels()));
    state.dimensionAssessments[1]!.level = 'missing';
    state.nextQuestion = {
      text: 'Which founders are primary?',
      dimension: 'audience',
      rationale: 'Clarify the audience.',
    };
    expect(chooseNextQuestion(state, 3)).toBe(state.nextQuestion);
    state.nextQuestion = {
      text: 'What is the timeline?',
      dimension: 'timeline',
      rationale: 'Clarify timing.',
    };
    expect(chooseNextQuestion(state, 3)).toMatchObject({ dimension: 'audience' });
  });

  it('enforces ready, maximum-question, and continue stop rules', () => {
    const ready = analysis(withLevels(allClearLevels()));
    expect(enforceStopRules(ready, 5)).toMatchObject({
      shouldStop: true,
      stopReason: 'ready',
      nextQuestion: null,
    });
    const unclear = analysis(emptyAssessments());
    expect(enforceStopRules(unclear, 12)).toMatchObject({
      shouldStop: true,
      stopReason: 'max_questions',
      nextQuestion: null,
    });
    expect(enforceStopRules(unclear, 2)).toMatchObject({
      shouldStop: false,
      stopReason: 'continue',
      nextQuestion: { dimension: 'problem' },
    });
    expect(chooseNextQuestion(unclear, 12)).toBeNull();
  });
});
