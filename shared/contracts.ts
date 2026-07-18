import { z } from 'zod';
import { dimensionKeys, dimensionLevels } from './domain.js';
export { dimensionKeys, dimensionLabels } from './domain.js';
export type { DimensionKey } from './domain.js';

const dimensionLevelSchema = z.enum(dimensionLevels);
const dimensionKeySchema = z.enum(dimensionKeys);

const evidenceSchema = z
  .object({
    answerId: z.string().min(1),
    excerpt: z.string().min(1).max(240),
  })
  .strict();

const dimensionAssessmentSchema = z
  .object({
    dimension: dimensionKeySchema,
    level: dimensionLevelSchema,
    rationale: z.string().min(1).max(400),
    evidence: z.array(evidenceSchema).max(8),
  })
  .strict();
export type DimensionAssessment = z.infer<typeof dimensionAssessmentSchema>;

const factSchema = z
  .object({
    statement: z.string().min(1).max(800),
    answerIds: z.array(z.string().min(1)).max(12),
  })
  .strict();

const assumptionSchema = z
  .object({
    statement: z.string().min(1).max(800),
    impact: z.enum(['low', 'medium', 'high']),
    needsHumanDecision: z.boolean(),
    answerIds: z.array(z.string().min(1)).max(12),
  })
  .strict();

const contradictionSchema = z
  .object({
    id: z.string().min(1).max(100),
    statementA: z.string().min(1).max(600),
    statementB: z.string().min(1).max(600),
    answerIds: z.array(z.string().min(1)).min(1).max(12),
    blocking: z.boolean(),
    resolved: z.boolean(),
    resolution: z.string().max(800).nullable(),
  })
  .strict();

const nextQuestionSchema = z
  .object({
    text: z.string().min(1).max(800),
    dimension: dimensionKeySchema,
    rationale: z.string().min(1).max(400),
  })
  .strict();
export type NextQuestion = z.infer<typeof nextQuestionSchema>;

export const interviewAnalysisSchema = z
  .object({
    facts: z.array(factSchema).max(40),
    assumptions: z.array(assumptionSchema).max(40),
    contradictions: z.array(contradictionSchema).max(20),
    dimensionAssessments: z.array(dimensionAssessmentSchema).length(8),
    nextQuestion: nextQuestionSchema.nullable(),
    shouldStop: z.boolean(),
    stopReason: z.enum(['ready', 'max_questions', 'needs_human', 'continue']),
  })
  .strict();

export type InterviewAnalysis = z.infer<typeof interviewAnalysisSchema>;

const workflowStatusSchema = z.enum(['draft', 'interviewing', 'needs_review', 'approved']);
const syncStatusSchema = z.enum(['not_synced', 'syncing', 'synced', 'error']);

const answerSchema = z
  .object({
    id: z.string(),
    clientAnswerId: z.string(),
    question: z.string(),
    dimension: dimensionKeySchema,
    text: z.string(),
    status: z.enum(['pending', 'processed', 'failed']),
    errorCode: z.string().nullable(),
    createdAt: z.string(),
    processedAt: z.string().nullable(),
  })
  .strict();
const briefSectionsSchema = z
  .object({
    summary: z.string().max(4000),
    problemStatement: z.string().max(4000),
    goals: z.array(z.string().max(1000)).max(20),
    successCriteria: z.array(z.string().max(1000)).max(20),
    audience: z.array(z.string().max(1000)).max(20),
    deliverables: z.array(z.string().max(1000)).max(30),
    mustHave: z.array(z.string().max(1000)).max(30),
    niceToHave: z.array(z.string().max(1000)).max(30),
    nonGoals: z.array(z.string().max(1000)).max(30),
    constraints: z.array(z.string().max(1000)).max(30),
    timeline: z.array(z.string().max(1000)).max(20),
    risks: z.array(z.string().max(1000)).max(30),
    assumptions: z.array(z.string().max(1000)).max(30),
    openQuestions: z.array(z.string().max(1000)).max(30),
    decisionsRequiringApproval: z.array(z.string().max(1000)).max(30),
    nextSteps: z.array(z.string().max(1000)).max(30),
  })
  .strict();
export type BriefSections = z.infer<typeof briefSectionsSchema>;

export const generatedBriefSchema = z
  .object({
    title: z.string().min(1).max(160),
    sections: briefSectionsSchema,
  })
  .strict();
export type GeneratedBrief = z.infer<typeof generatedBriefSchema>;

const alignmentSchema = z
  .object({
    initialScore: z.number().min(0).max(100),
    finalScore: z.number().min(0).max(100),
    delta: z.number().min(-100).max(100),
    assumptionsSurfaced: z.number().int().min(0),
    contradictionsResolved: z.number().int().min(0),
    humanDecisionsRemaining: z.number().int().min(0),
  })
  .strict();

export const briefVersionSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    version: z.number().int().positive(),
    title: z.string(),
    sections: briefSectionsSchema,
    status: z.enum(['draft', 'approved', 'superseded']),
    clarificationLabel: z.enum(['ready', 'needs_clarification']),
    alignment: alignmentSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    approvedAt: z.string().nullable(),
    approvedBy: z.string().nullable(),
  })
  .strict();
export type BriefVersion = z.infer<typeof briefVersionSchema>;

export const projectSchema = z
  .object({
    id: z.string(),
    revision: z.number().int().positive(),
    ownerId: z.string(),
    title: z.string(),
    initialPrompt: z.string(),
    locale: z.enum(['en', 'th']),
    workflowStatus: workflowStatusSchema,
    syncStatus: syncStatusSchema,
    answers: z.array(answerSchema),
    analysis: interviewAnalysisSchema,
    initialAssessments: z.array(dimensionAssessmentSchema).length(8),
    currentQuestion: nextQuestionSchema.nullable(),
    briefVersions: z.array(briefVersionSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
    notionParentId: z.string().nullable(),
    notionPageId: z.string().nullable(),
    lastSyncError: z.string().nullable(),
  })
  .strict();
export type Project = z.infer<typeof projectSchema>;

export const capabilityStatusSchema = z.object({
  model: z.object({
    mode: z.enum(['disabled', 'live', 'mock']),
    available: z.boolean(),
  }),
  notion: z.object({
    mode: z.enum(['live', 'mock']),
    available: z.boolean(),
  }),
  codex: z.object({
    mode: z.enum(['disabled', 'enabled']),
    available: z.boolean(),
  }),
});

export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;

export const createProjectInputSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    initialPrompt: z.string().trim().min(10).max(10_000),
    locale: z.enum(['en', 'th']).default('en'),
  })
  .strict();

export const codexCreateProjectInputSchema = createProjectInputSchema.extend({
  clientProjectId: z.string().uuid(),
});

export const codexInterviewTurnInputSchema = z
  .object({
    projectId: z.string().uuid(),
    clientAnswerId: z.string().uuid(),
    answer: z.string().trim().min(1).max(10_000),
    analysis: interviewAnalysisSchema,
  })
  .strict();

export const codexBriefDraftInputSchema = z
  .object({
    projectId: z.string().uuid(),
    brief: generatedBriefSchema,
  })
  .strict();

export const submitAnswerInputSchema = z
  .object({
    clientAnswerId: z.string().uuid(),
    question: z.string().min(1).max(1000),
    dimension: dimensionKeySchema,
    answer: z.string().trim().min(1).max(10_000),
  })
  .strict();

export const editBriefInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().min(1).max(160),
    sections: briefSectionsSchema,
  })
  .strict();

export const requestChangesInputSchema = z
  .object({
    section: z.string().min(1).max(80),
    dimension: dimensionKeySchema,
    reason: z.string().trim().min(5).max(1500),
  })
  .strict();

export const selectNotionParentInputSchema = z
  .object({ parentId: z.string().min(1).max(200), parentTitle: z.string().max(300).optional() })
  .strict();

export const emptyBriefSections: BriefSections = {
  summary: '',
  problemStatement: '',
  goals: [],
  successCriteria: [],
  audience: [],
  deliverables: [],
  mustHave: [],
  niceToHave: [],
  nonGoals: [],
  constraints: [],
  timeline: [],
  risks: [],
  assumptions: [],
  openQuestions: [],
  decisionsRequiringApproval: [],
  nextSteps: [],
};
