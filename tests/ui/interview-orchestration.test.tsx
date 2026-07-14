import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/api';
import {
  prepareSubmission,
  recoveryOutcome,
  type PendingAnswer,
} from '../../src/features/interview/useInterview';
import { makeProject } from './fixtures';

describe('interview client orchestration', () => {
  it('retains the exact pending payload and client ID until the result is known', () => {
    const project = makeProject();
    const pending: PendingAnswer = {
      clientAnswerId: 'stable-answer-id',
      question: 'Original question',
      dimension: 'audience',
      answer: 'Original answer',
    };
    expect(prepareSubmission(project, 'Changed input', pending)).toBe(pending);
  });

  it('distinguishes completed, ambiguous, and definite-failure recovery', () => {
    const project = makeProject();
    const submission = prepareSubmission(project, 'Specific answer', null, () => 'answer-id');
    expect(recoveryOutcome(project, submission, new TypeError('network'))).toBe('retain');
    expect(recoveryOutcome(project, submission, new ApiError(400, 'INVALID', 'invalid'))).toBe(
      'discard',
    );
    project.answers.push({
      id: 'answer',
      clientAnswerId: submission.clientAnswerId,
      question: submission.question,
      dimension: submission.dimension,
      text: submission.answer,
      status: 'processed',
      errorCode: null,
      createdAt: project.createdAt,
      processedAt: project.updatedAt,
    });
    expect(recoveryOutcome(project, submission, new TypeError('network'))).toBe('complete');
  });
});
