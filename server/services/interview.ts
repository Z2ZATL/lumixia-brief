import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { submitAnswerInputSchema, type Project } from '../../shared/contracts.js';
import { enforceStopRules, initialQuestion } from '../domain/interview.js';
import { HttpError } from '../http.js';
import type { ModelProvider } from '../providers/model.js';
import type { RequestIdentity } from '../routes/request.js';
import type { InterviewTurnClaim, ProjectStore } from '../store/types.js';
import { getOwnedProject, touch } from './support.js';

type SubmitAnswerInput = z.infer<typeof submitAnswerInputSchema>;
type AnswerRecord = Project['answers'][number];

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
    return this.store.saveProject(project, identity.token);
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
    );
    const duplicate = await this.resolveClaim(identity, project, input.clientAnswerId, claim);
    if (duplicate) return duplicate;
    const answer = this.createAnswer(input);
    project.answers.push(answer);
    project.workflowStatus = 'interviewing';
    touch(project);
    project = await this.store.saveProject(project, identity.token);
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
    );
    const duplicate = await this.resolveClaim(identity, project, answer.clientAnswerId, claim);
    if (duplicate) return duplicate;
    answer.status = 'pending';
    answer.errorCode = null;
    touch(project);
    await this.store.saveProject(project, identity.token);
    return this.analyze(identity, project, answer, 'The answer remains saved and can be retried.');
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
      (await this.store.getProject(identity.ownerId, project.id, identity.token)) ??
      project;
    return {
      httpStatus: claim.status === 'pending' ? 202 : 200,
      project: resultProject,
      answer: resultProject.answers.find((item) => item.clientAnswerId === clientAnswerId) ?? null,
      status: claim.status,
      idempotent: true,
    };
  }

  private createAnswer(input: SubmitAnswerInput): AnswerRecord {
    return {
      id: randomUUID(),
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

  private async analyze(
    identity: RequestIdentity,
    project: Project,
    answer: AnswerRecord,
    failureMessage: string,
  ): Promise<InterviewServiceResult> {
    const savedAnswer = this.answerInProject(project, answer.id);
    try {
      project.analysis = enforceStopRules(
        await this.model.analyzeInterview(project),
        project.answers.length,
      );
      project.currentQuestion = project.analysis.nextQuestion;
      savedAnswer.status = 'processed';
      savedAnswer.processedAt = new Date().toISOString();
      touch(project);
      const saved = await this.store.saveProject(project, identity.token);
      await this.complete(identity, saved, savedAnswer, 'processed', null);
      return {
        httpStatus: 200,
        project: saved,
        answer: savedAnswer,
        status: 'processed',
        idempotent: false,
      };
    } catch {
      savedAnswer.status = 'failed';
      savedAnswer.errorCode = 'MODEL_UNAVAILABLE';
      touch(project);
      const failed = await this.store.saveProject(project, identity.token);
      await this.complete(identity, failed, savedAnswer, 'failed', 'MODEL_UNAVAILABLE');
      throw new HttpError(502, 'MODEL_UNAVAILABLE', failureMessage);
    }
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
    );
  }
}
