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
import { emptyAssessments } from '../domain/confidence.js';

export interface ModelProvider {
  analyzeInterview(project: Project): Promise<InterviewAnalysis>;
  generateBrief(project: Project): Promise<GeneratedBrief>;
}

const INTERVIEW_SYSTEM = `You are Lumixia Brief's alignment analyst. Your job is not to rush into generating work. Separate verified facts from assumptions, expose contradictions, and identify decisions that still require a human.

Assess exactly eight dimensions: problem, audience, outcome, scope, constraints, timeline, risks, successCriteria. Use Missing when absent, Assumed when inferred, Partial when mentioned but not decision-ready, and Clear only when specific and supported. Evidence must cite provided answer IDs and quote only a short excerpt. Never invent evidence.

Choose only one next question. Priority is: blocking contradiction, essential gap (problem/audience/outcome/scope/successCriteria), lowest-scoring dimension, then risk clarification. Ask a single concise question in the project's locale. You may recommend stopping, but the server enforces final stop rules.`;

const BRIEF_SYSTEM = `You are Lumixia Brief's project editor. Produce a decision-ready structured project brief using only the supplied project state. Preserve uncertainty: assumptions must remain assumptions, unresolved items go to openQuestions, and choices needing a human go to decisionsRequiringApproval. Do not fabricate dates, budgets, users, metrics, features, or technical constraints. Keep the brief concise enough to review on one page while retaining actionable detail.`;

export class OpenAIModelProvider implements ModelProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = 'gpt-5.6',
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 });
  }

  async analyzeInterview(project: Project): Promise<InterviewAnalysis> {
    const input = this.modelInput(project);
    return this.withRetry(async () => {
      const response = await this.client.responses.parse({
        model: this.model,
        store: false,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: INTERVIEW_SYSTEM },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: { format: zodTextFormat(interviewAnalysisSchema, 'interview_analysis') },
      });
      if (!response.output_parsed) throw new ModelContractError('MODEL_REFUSAL_OR_EMPTY_OUTPUT');
      return interviewAnalysisSchema.parse(response.output_parsed);
    });
  }

  async generateBrief(project: Project): Promise<GeneratedBrief> {
    const input = this.modelInput(project);
    return this.withRetry(async () => {
      const response = await this.client.responses.parse({
        model: this.model,
        store: false,
        reasoning: { effort: 'medium' },
        input: [
          { role: 'system', content: BRIEF_SYSTEM },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: { format: zodTextFormat(generatedBriefSchema, 'generated_brief') },
      });
      if (!response.output_parsed) throw new ModelContractError('MODEL_REFUSAL_OR_EMPTY_OUTPUT');
      return generatedBriefSchema.parse(response.output_parsed);
    });
  }

  private modelInput(project: Project) {
    return {
      locale: project.locale,
      initialIdea: project.initialPrompt,
      answers: project.answers.map((answer) => ({
        id: answer.id,
        question: answer.question,
        dimension: answer.dimension,
        answer: answer.text,
      })),
      previousAnalysis: project.analysis,
    };
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

class ModelContractError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'ModelContractError';
  }
}

function isRetryableModelError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = 'status' in error ? Number(error.status) : 0;
  return status === 429 || status >= 500;
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
