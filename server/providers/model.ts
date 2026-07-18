import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  dimensionKeys,
  generatedBriefSchema,
  interviewAnalysisSchema,
  type DimensionAssessment,
  type GeneratedBrief,
  type InterviewAnalysis,
  type Project,
} from '../../shared/contracts.js';
import {
  briefSystemPrompt,
  interviewSystemPrompt,
  modelProjectContext,
} from '../../shared/model-prompts.js';
import { emptyAssessments } from '../domain/confidence.js';

export interface ModelProvider {
  analyzeInterview(project: Project, signal?: AbortSignal): Promise<InterviewAnalysis>;
  generateBrief(project: Project, signal?: AbortSignal): Promise<GeneratedBrief>;
}

export interface ModelResponseClient {
  parse(
    input: Parameters<OpenAI['responses']['parse']>[0],
    options?: { signal?: AbortSignal },
  ): Promise<{ output_parsed: unknown }>;
}

export type ModelErrorCode =
  'MODEL_INVALID_RESPONSE' | 'MODEL_NOT_CONFIGURED' | 'MODEL_UNAVAILABLE';

export class ModelProviderError extends Error {
  constructor(readonly code: ModelErrorCode) {
    super(code);
    this.name = 'ModelProviderError';
  }
}

export class OpenAIModelProvider implements ModelProvider {
  private readonly responses: ModelResponseClient;

  constructor(
    apiKey: string,
    private readonly model = 'gpt-5.6',
    responses?: ModelResponseClient,
  ) {
    const client = responses ? null : new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 });
    this.responses =
      responses ??
      ({
        parse: (input, options) => client!.responses.parse(input, options),
      } satisfies ModelResponseClient);
  }

  async analyzeInterview(project: Project, signal?: AbortSignal): Promise<InterviewAnalysis> {
    const input = modelProjectContext(project);
    return this.execute(
      () =>
        this.responses.parse(
          {
            model: this.model,
            store: false,
            reasoning: { effort: 'low' },
            input: [
              { role: 'system', content: interviewSystemPrompt },
              { role: 'user', content: JSON.stringify(input) },
            ],
            text: { format: zodTextFormat(interviewAnalysisSchema, 'interview_analysis') },
          },
          signal ? { signal } : undefined,
        ),
      interviewAnalysisSchema,
    );
  }

  async generateBrief(project: Project, signal?: AbortSignal): Promise<GeneratedBrief> {
    const input = modelProjectContext(project);
    return this.execute(
      () =>
        this.responses.parse(
          {
            model: this.model,
            store: false,
            reasoning: { effort: 'medium' },
            input: [
              { role: 'system', content: briefSystemPrompt },
              { role: 'user', content: JSON.stringify(input) },
            ],
            text: { format: zodTextFormat(generatedBriefSchema, 'generated_brief') },
          },
          signal ? { signal } : undefined,
        ),
      generatedBriefSchema,
    );
  }

  private async execute<T>(
    operation: () => Promise<{ output_parsed: unknown }>,
    schema: { parse(value: unknown): T },
  ): Promise<T> {
    try {
      const response = await this.withRetry(operation);
      if (!response.output_parsed) throw new ModelProviderError('MODEL_INVALID_RESPONSE');
      return schema.parse(response.output_parsed);
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      if (isContractError(error)) throw new ModelProviderError('MODEL_INVALID_RESPONSE');
      throw new ModelProviderError('MODEL_UNAVAILABLE');
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableModelError(error)) throw error;
      return operation();
    }
  }
}

function isRetryableModelError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = 'status' in error ? Number(error.status) : 0;
  return status === 429 || status >= 500;
}

function isContractError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    ('issues' in error || ('name' in error && String(error.name).includes('Parse'))),
  );
}

export class DisabledModelProvider implements ModelProvider {
  analyzeInterview(_project: Project, _signal?: AbortSignal): Promise<InterviewAnalysis> {
    return Promise.reject(new ModelProviderError('MODEL_NOT_CONFIGURED'));
  }

  generateBrief(_project: Project, _signal?: AbortSignal): Promise<GeneratedBrief> {
    return Promise.reject(new ModelProviderError('MODEL_NOT_CONFIGURED'));
  }
}

export class MockModelProvider implements ModelProvider {
  async analyzeInterview(project: Project): Promise<InterviewAnalysis> {
    const answers = project.answers;
    const assessments: DimensionAssessment[] = emptyAssessments().map((assessment) => {
      const evidence = answers.filter((answer) => answer.dimension === assessment.dimension);
      if (!evidence.length) return assessment;
      return {
        dimension: assessment.dimension,
        level: evidence.length > 1 || (evidence[0]?.text.length ?? 0) >= 40 ? 'clear' : 'partial',
        rationale: `The interview includes direct evidence for ${assessment.dimension}.`,
        evidence: evidence.slice(-3).map((answer) => ({
          answerId: answer.id,
          excerpt: answer.text.slice(0, 240),
        })),
      };
    });
    const nextDimension = dimensionKeys.find(
      (dimension) => assessments.find((item) => item.dimension === dimension)?.level === 'missing',
    );
    return {
      facts: answers.map((answer) => ({
        statement: answer.text,
        answerIds: [answer.id],
      })),
      assumptions: [],
      contradictions: [],
      dimensionAssessments: assessments,
      nextQuestion: nextDimension
        ? {
            text: `Please clarify the ${nextDimension} for this project.`,
            dimension: nextDimension,
            rationale: `${nextDimension} still needs direct evidence.`,
          }
        : null,
      shouldStop: false,
      stopReason: 'continue',
    };
  }

  async generateBrief(project: Project): Promise<GeneratedBrief> {
    const byDimension = (dimension: string) =>
      project.answers
        .filter((answer) => answer.dimension === dimension)
        .map((answer) => answer.text);
    const all = project.answers.map((answer) => answer.text);
    return {
      title: project.title,
      sections: {
        summary: `${project.initialPrompt}\n\nValidated through ${project.answers.length} interview answers.`,
        problemStatement: byDimension('problem').join('\n') || project.initialPrompt,
        goals: byDimension('outcome'),
        successCriteria: byDimension('successCriteria'),
        audience: byDimension('audience'),
        deliverables: byDimension('scope'),
        mustHave: byDimension('scope'),
        niceToHave: [],
        nonGoals: [],
        constraints: byDimension('constraints'),
        timeline: byDimension('timeline'),
        risks: byDimension('risks'),
        assumptions: project.analysis.assumptions.map((item) => item.statement),
        openQuestions: project.analysis.dimensionAssessments
          .filter((item) => item.level === 'missing' || item.level === 'assumed')
          .map((item) => `Clarify ${item.dimension}.`),
        decisionsRequiringApproval: project.analysis.assumptions
          .filter((item) => item.needsHumanDecision)
          .map((item) => item.statement),
        nextSteps: all.length
          ? ['Review the structured brief.', 'Approve or request a focused revision.']
          : [],
      },
    };
  }
}
