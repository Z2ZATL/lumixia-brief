import {
  emptyBriefSections,
  type DimensionAssessment,
  type Project,
} from '../../shared/contracts.js';
import { dimensionKeys } from '../../shared/domain.js';

const now = '2026-07-15T00:00:00.000Z';

function assessments(): DimensionAssessment[] {
  return dimensionKeys.map((dimension) => ({
    dimension,
    level: 'missing',
    rationale: 'Not answered yet.',
    evidence: [],
  }));
}

export function makeProject(withBrief = false): Project {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    revision: 1,
    ownerId: 'user-a',
    title: 'Founder launch brief',
    initialPrompt: 'Build a launch workflow for Codex with a clear review step.',
    locale: 'en',
    workflowStatus: withBrief ? 'needs_review' : 'interviewing',
    syncStatus: 'not_synced',
    answers: [],
    analysis: {
      facts: [],
      assumptions: [],
      contradictions: [],
      dimensionAssessments: assessments(),
      nextQuestion: {
        text: 'Who is the primary audience?',
        dimension: 'audience',
        rationale: 'The audience determines the scope.',
      },
      shouldStop: false,
      stopReason: 'continue',
    },
    initialAssessments: assessments(),
    currentQuestion: {
      text: 'Who is the primary audience?',
      dimension: 'audience',
      rationale: 'The audience determines the scope.',
    },
    briefVersions: withBrief
      ? [
          {
            id: 'brief-1',
            projectId: '11111111-1111-4111-8111-111111111111',
            version: 1,
            title: 'Founder launch brief',
            sections: {
              ...structuredClone(emptyBriefSections),
              summary: 'A reviewed launch workflow.',
            },
            status: 'draft',
            clarificationLabel: 'ready',
            alignment: {
              initialScore: 20,
              finalScore: 80,
              delta: 60,
              assumptionsSurfaced: 2,
              contradictionsResolved: 1,
              humanDecisionsRemaining: 1,
            },
            createdAt: now,
            updatedAt: now,
            approvedAt: null,
            approvedBy: null,
          },
        ]
      : [],
    createdAt: now,
    updatedAt: now,
    notionParentId: null,
    notionPageId: null,
    lastSyncError: null,
  };
}
