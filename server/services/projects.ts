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

export class ProjectService {
  constructor(private readonly store: ProjectStore) {}

  list(identity: RequestIdentity) {
    return this.store.listProjects(identity.ownerId, identity.token);
  }

  get(identity: RequestIdentity, projectId: string) {
    return getOwnedProject(this.store, identity, projectId);
  }

  async create(identity: RequestIdentity, input: CreateProjectInput) {
    const now = new Date().toISOString();
    const question = initialQuestion(input.locale);
    const project: Project = {
      id: randomUUID(),
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
    return this.store.createProject(projectSchema.parse(project), identity.token);
  }

  async delete(identity: RequestIdentity, projectId: string) {
    const deleted = await this.store.deleteProject(identity.ownerId, projectId, identity.token);
    if (!deleted) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }
}
