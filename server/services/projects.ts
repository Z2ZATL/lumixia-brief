import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createProjectInputSchema, projectSchema, type Project } from '../../shared/contracts.js';
import { assessInitialPrompt, emptyAssessments } from '../domain/confidence.js';
import { initialQuestion } from '../domain/interview.js';
import { HttpError } from '../http.js';
import type { RequestIdentity } from '../routes/request.js';
import type { ProjectStore } from '../store/types.js';
import { getOwnedProject } from './support.js';

type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
type CodexCreateProjectInput = CreateProjectInput & { clientProjectId: string };

export class ProjectService {
  constructor(private readonly store: ProjectStore) {}

  list(identity: RequestIdentity) {
    return this.store.listProjects(identity.ownerId, identity.token, identity.signal);
  }

  get(identity: RequestIdentity, projectId: string) {
    return getOwnedProject(this.store, identity, projectId);
  }

  async create(identity: RequestIdentity, input: CreateProjectInput) {
    return this.createProject(identity, input, randomUUID());
  }

  async createFromCodex(identity: RequestIdentity, input: CodexCreateProjectInput) {
    const existing = await this.store.getProject(
      identity.ownerId,
      input.clientProjectId,
      identity.token,
      identity.signal,
    );
    if (existing) {
      if (this.matchesInput(existing, input)) return { project: existing, idempotent: true };
      throw new HttpError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'The project ID is already associated with different content.',
      );
    }
    const project = await this.createProject(identity, input, input.clientProjectId);
    return { project, idempotent: false };
  }

  private async createProject(identity: RequestIdentity, input: CreateProjectInput, id: string) {
    const now = new Date().toISOString();
    const question = initialQuestion(input.locale);
    const project: Project = {
      id,
      revision: 1,
      ownerId: identity.ownerId,
      title: input.title,
      initialPrompt: input.initialPrompt,
      locale: input.locale,
      workflowStatus: 'draft',
      syncStatus: 'not_synced',
      answers: [],
      analysis: {
        facts: [],
        assumptions: [],
        contradictions: [],
        dimensionAssessments: emptyAssessments(),
        nextQuestion: question,
        shouldStop: false,
        stopReason: 'continue',
      },
      initialAssessments: assessInitialPrompt(input.initialPrompt),
      currentQuestion: question,
      briefVersions: [],
      createdAt: now,
      updatedAt: now,
      notionParentId: null,
      notionPageId: null,
      lastSyncError: null,
    };
    return this.store.createProject(projectSchema.parse(project), identity.token, identity.signal);
  }

  private matchesInput(project: Project, input: CreateProjectInput): boolean {
    return (
      project.title === input.title &&
      project.initialPrompt === input.initialPrompt &&
      project.locale === input.locale
    );
  }

  async delete(identity: RequestIdentity, projectId: string) {
    const deleted = await this.store.deleteProject(
      identity.ownerId,
      projectId,
      identity.token,
      identity.signal,
    );
    if (!deleted) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }
}
