import { describe, expect, it } from 'vitest';
import type { InterviewAnalysis } from '../../shared/contracts.js';
import { emptyAssessments } from '../../server/domain/confidence.js';
import { chooseNextQuestion, enforceStopRules } from '../../server/domain/interview.js';

const base = (): InterviewAnalysis => ({
  facts: [],
  assumptions: [],
  contradictions: [],
  dimensionAssessments: emptyAssessments(),
  nextQuestion: { text: 'Model question', dimension: 'risks', rationale: 'Model rationale' },
  shouldStop: false,
  stopReason: 'continue',
});

describe('interview priority and stop rules', () => {
  it('asks about a blocking contradiction before other gaps', () => {
    const state = base();
    state.contradictions.push({
      id: 'c',
      statementA: 'Ship today',
      statementB: 'Wait for review',
      answerIds: ['a1'],
      blocking: true,
      resolved: false,
      resolution: null,
    });
    expect(chooseNextQuestion(state, 2)?.text).toContain('conflict');
  });

  it('server ignores a premature model stop', () => {
    const state = base();
    state.shouldStop = true;
    state.stopReason = 'ready';
    const enforced = enforceStopRules(state, 2);
    expect(enforced.shouldStop).toBe(false);
    expect(enforced.stopReason).toBe('continue');
  });

  it('stops at 12 and removes the next question', () => {
    const enforced = enforceStopRules(base(), 12);
    expect(enforced).toMatchObject({
      shouldStop: true,
      stopReason: 'max_questions',
      nextQuestion: null,
    });
  });
});
