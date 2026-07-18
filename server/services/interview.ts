import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  submitAnswerInputSchema,
  type InterviewAnalysis,
  type Project,
} from '../../shared/contracts.js';
import { dimensionKeys } from '../../shared/domain.js';
import { enforceStopRules, initialQuestion } from '../domain/interview.js';
import { HttpError } from '../http.js';
import type { ModelProvider } from '../providers/model.js';
import type { RequestIdentity } from '../routes/request.js';
import type { InterviewTurnClaim, ProjectStore } from '../store/types.js';
import { getOwnedProject, modelHttpError, touch } from './support.js';

type SubmitAnswerInput = z.infer<typeof submitAnswerInputSchema>;
type AnswerRecord = Project['answers'][number];
interface CodexTurnInput {
  clientAnswerId: string;
  answer: string;
  analysis: InterviewAnalysis;
}

export interface InterviewServiceResult {
  httpStatus: 200 | 202;
  project: Project;
  answer: AnswerRecord | null;
  status: 'processed' | 'pending' | 'failed';
  idempotent: boolean;
}

export class InterviewService {
  constructor(
    private readonly store: ProjectStore,
    private readonly model: ModelProvider,
  ) {}

  async start(identity: RequestIdentity, projectId: string) {
    const project = await getOwnedProject(this.store, identity, projectId);
    if (project.workflowStatus === 'draft') project.workflowStatus = 'interviewing';
    project.currentQuestion ??= initialQuestion(project.locale);
    touch(project);
    return this.store.saveProject(project, identity.token, identity.signal);
  }

  async submit(identity: RequestIdentity, projectId: string, input: SubmitAnswerInput) {
    let project = await getOwnedProject(this.store, identity, projectId);
    this.assertCanAnswer(project);
    const claim = await this.store.claimInterviewTurn(
      identity.ownerId,
      project.id,
      input.clientAnswerId,
      input,
      false,
      identity.token,
      identity.signal,
    );
    const duplicate = await this.resolveClaim(identity, project, input.clientAnswerId, claim);
    if (duplicate) return duplicate;
    const answer = this.createAnswer(input);
    project.answers.push(answer);
    project.workflowStatus = 'interviewing';
    touch(project);
    project = await this.store.saveProject(project, identity.token, identity.signal);
    return this.analyze(
      identity,
      project,
      answer,
      'The answer is saved and can be retried safely.',
    );
  }

  async retry(identity: RequestIdentity, projectId: string, clientAnswerId: string) {
    const project = await getOwnedProject(this.store, identity, projectId);
    const answer = project.answers.find((item) => item.clientAnswerId === clientAnswerId);
    if (!answer) throw new HttpError(404, 'ANSWER_NOT_FOUND', 'Answer not found.');
    const payload = {
      clientAnswerId: answer.clientAnswerId,
      question: answer.question,
      dimension: answer.dimension,
      answer: answer.text,
    };
    const claim = await this.store.claimInterviewTurn(
      identity.ownerId,
      project.id,
      answer.clientAnswerId,
      payload,
      true,
      identity.token,
      identity.signal,
    );
    const duplicate = await this.resolveClaim(identity, project, answer.clientAnswerId, claim);
    if (duplicate) return duplicate;
    answer.status = 'pending';
    answer.errorCode = null;
    touch(project);
    await this.store.saveProject(project, identity.token, identity.signal);
    return this.analyze(identity, project, answer, 'The answer remains saved and can be retried.');
  }

  async submitFromCodex(identity: RequestIdentity, projectId: string, input: CodexTurnInput) {
    const project = await getOwnedProject(this.store, identity, projectId);
    const existingAnswer = project.answers.find(
      (answer) => answer.clientAnswerId === input.clientAnswerId,
    );
    if (existingAnswer) {
      if (existingAnswer.text !== input.answer) {
        throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Stored answer content does not match.');
      }
      if (existingAnswer.status === 'processed') {
        return {
          httpStatus: 200 as const,
          project,
          answer: existingAnswer,
          status: 'processed' as const,
          idempotent: true,
        };
      }
      this.assertAnalysis(input.analysis, project, input.clientAnswerId);
      const existingInput: SubmitAnswerInput = {
        clientAnswerId: input.clientAnswerId,
        question: existingAnswer.question,
        dimension: existingAnswer.dimension,
        answer: input.answer,
      };
      const claim = await this.claimCodexTurn(
        identity,
        project,
        existingInput,
        input.analysis,
        true,
      );
      const duplicate = await this.resolveClaim(identity, project, input.clientAnswerId, claim);
      if (duplicate) return duplicate;
      return this.finishCodexTurn(identity, project, existingAnswer, input.analysis, true);
    }
    this.assertCanAnswer(project);
    const question = project.currentQuestion;
    if (!question) throw new HttpError(409, 'INTERVIEW_COMPLETE', 'No interview question remains.');
    const answerInput: SubmitAnswerInput = {
      clientAnswerId: input.clientAnswerId,
      question: question.text,
      dimension: question.dimension,
      answer: input.answer,
    };
    this.assertAnalysis(input.analysis, project, input.clientAnswerId);
    const claim = await this.claimCodexTurn(identity, project, answerInput, input.analysis, false);
    const duplicate = await this.resolveClaim(identity, project, input.clientAnswerId, claim);
    if (duplicate) return duplicate;
    const answer = this.createAnswer(answerInput, input.clientAnswerId);
    project.answers.push(answer);
    project.workflowStatus = 'interviewing';
    return this.finishCodexTurn(identity, project, answer, input.analysis, false);
  }

  private claimCodexTurn(
    identity: RequestIdentity,
    project: Project,
    input: SubmitAnswerInput,
    analysis: InterviewAnalysis,
    retryFailed: boolean,
  ) {
    return this.store.claimInterviewTurn(
      identity.ownerId,
      project.id,
      input.clientAnswerId,
      { ...input, source: 'codex', analysis },
      retryFailed,
      identity.token,
      identity.signal,
    );
  }

  private async finishCodexTurn(
    identity: RequestIdentity,
    project: Project,
    answer: AnswerRecord,
    analysis: InterviewAnalysis,
    idempotent: boolean,
  ): Promise<InterviewServiceResult> {
    project.analysis = enforceStopRules(analysis, project.answers.length);
    project.currentQuestion = project.analysis.nextQuestion;
    answer.status = 'processed';
    answer.errorCode = null;
    answer.processedAt ??= new Date().toISOString();
    touch(project);
    const saved = await this.store.saveProject(project, identity.token, identity.signal);
    await this.complete(identity, saved, answer, 'processed', null);
    return {
      httpStatus: 200,
      project: saved,
      answer,
      status: 'processed',
      idempotent,
    };
  }

  private assertCanAnswer(project: Project) {
    if (project.answers.length >= 12) {
      throw new HttpError(409, 'QUESTION_LIMIT', 'The 12-question limit has been reached.');
    }
    if (project.workflowStatus === 'approved') {
      throw new HttpError(409, 'APPROVED_IMMUTABLE', 'Request a revision first.');
    }
  }

  private async resolveClaim(
    identity: RequestIdentity,
    project: Project,
    clientAnswerId: string,
    claim: InterviewTurnClaim,
  ): Promise<InterviewServiceResult | null> {
    if (claim.state === 'busy') {
      throw new HttpError(409, 'PROJECT_BUSY', 'Another answer is being processed.');
    }
    if (claim.state === 'conflict') {
      throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Stored answer content does not match.');
    }
    if (claim.state !== 'duplicate') return null;
    const resultProject =
      claim.result ??
      (await this.store.getProject(
        identity.ownerId,
        project.id,
        identity.token,
        identity.signal,
      )) ??
      project;
    const storedAnswer =
      resultProject.answers.find((item) => item.clientAnswerId === clientAnswerId) ?? null;
    const recoveredStatus =
      claim.status === 'pending' && storedAnswer && storedAnswer.status !== 'pending'
        ? storedAnswer.status
        : claim.status;
    if (claim.status === 'pending' && recoveredStatus !== 'pending') {
      await this.store.completeInterviewTurn(
        identity.ownerId,
        project.id,
        clientAnswerId,
        recoveredStatus,
        resultProject,
        storedAnswer?.errorCode ?? null,
        identity.token,
        identity.signal,
      );
    }
    return {
      httpStatus: recoveredStatus === 'pending' ? 202 : 200,
      project: resultProject,
      answer: storedAnswer,
      status: recoveredStatus,
      idempotent: true,
    };
  }

  private createAnswer(input: SubmitAnswerInput, id: string = randomUUID()): AnswerRecord {
    return {
      id,
      clientAnswerId: input.clientAnswerId,
      question: input.question,
      dimension: input.dimension,
      text: input.answer,
      status: 'pending',
      errorCode: null,
      createdAt: new Date().toISOString(),
      processedAt: null,
    };
  }

  private assertAnalysis(
    analysis: InterviewAnalysis,
    project: Project,
    currentAnswerId: string,
  ): void {
    const dimensions = new Set(analysis.dimensionAssessments.map((item) => item.dimension));
    if (dimensions.size !== dimensionKeys.length) throw invalidCodexAnalysis();
    const allowed = new Set<string>([
      'initial-prompt',
      currentAnswerId,
      ...project.answers.map((answer) => answer.id),
    ]);
    const referenced = [
      ...analysis.facts.flatMap((item) => item.answerIds),
      ...analysis.assumptions.flatMap((item) => item.answerIds),
      ...analysis.contradictions.flatMap((item) => item.answerIds),
      ...analysis.dimensionAssessments.flatMap((item) =>
        item.evidence.map((evidence) => evidence.answerId),
      ),
    ];
    if (referenced.some((answerId) => !allowed.has(answerId))) throw invalidCodexAnalysis();
  }

  private async analyze(
    identity: RequestIdentity,
    project: Project,
    answer: AnswerRecord,
    failureMessage: string,
  ): Promise<InterviewServiceResult> {
    const savedAnswer = this.answerInProject(project, answer.id);
    let analysis: Awaited<ReturnType<ModelProvider['analyzeInterview']>>;
    try {
      analysis = await this.model.analyzeInterview(project, identity.signal);
    } catch (error) {
      const httpError = modelHttpError(error);
      const errorCode = httpError instanceof HttpError ? httpError.code : 'MODEL_UNAVAILABLE';
      savedAnswer.status = 'failed';
      savedAnswer.errorCode = errorCode;
      touch(project);
      const failed = await this.store.saveProject(project, identity.token, identity.signal);
      await this.complete(identity, failed, savedAnswer, 'failed', errorCode);
      if (httpError instanceof HttpError) throw httpError;
      throw new HttpError(502, 'MODEL_UNAVAILABLE', failureMessage);
    }
    project.analysis = enforceStopRules(analysis, project.answers.length);
    project.currentQuestion = project.analysis.nextQuestion;
    savedAnswer.status = 'processed';
    savedAnswer.processedAt = new Date().toISOString();
    touch(project);
    const saved = await this.store.saveProject(project, identity.token, identity.signal);
    await this.complete(identity, saved, savedAnswer, 'processed', null);
    return {
      httpStatus: 200,
      project: saved,
      answer: savedAnswer,
      status: 'processed',
      idempotent: false,
    };
  }

  private answerInProject(project: Project, answerId: string) {
    const answer = project.answers.find((item) => item.id === answerId);
    if (!answer) throw new Error('ANSWER_STATE_MISSING');
    return answer;
  }

  private complete(
    identity: RequestIdentity,
    project: Project,
    answer: AnswerRecord,
    status: 'processed' | 'failed',
    errorCode: string | null,
  ) {
    return this.store.completeInterviewTurn(
      identity.ownerId,
      project.id,
      answer.clientAnswerId,
      status,
      project,
      errorCode,
      identity.token,
      identity.signal,
    );
  }
}

function invalidCodexAnalysis() {
  return new HttpError(
    400,
    'MCP_INVALID_ANALYSIS',
    'The interview analysis contains invalid dimensions or evidence references.',
  );
}
