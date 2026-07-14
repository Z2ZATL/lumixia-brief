import type { Project } from '../../shared/contracts.js';
import { WorkflowConflict } from '../domain/workflow.js';
import { HttpError } from '../http.js';
import type { RequestIdentity } from '../routes/request.js';
import type { ProjectStore } from '../store/types.js';

export async function getOwnedProject(
  store: ProjectStore,
  identity: RequestIdentity,
  projectId: string,
) {
  const project = await store.getProject(identity.ownerId, projectId, identity.token);
  if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return project;
}

export function touch(project: Project) {
  project.updatedAt = new Date().toISOString();
}

export function workflowHttpError(error: unknown) {
  if (error instanceof WorkflowConflict) {
    return new HttpError(409, 'WORKFLOW_CONFLICT', error.message);
  }
  return error;
}
