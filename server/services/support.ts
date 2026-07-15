import type { Project } from '../../shared/contracts.js';
import { WorkflowConflict } from '../domain/workflow.js';
import { HttpError } from '../http.js';
import { ModelProviderError } from '../providers/model.js';
import type { RequestIdentity } from '../routes/request.js';
import type { ProjectStore } from '../store/types.js';

export async function getOwnedProject(
  store: ProjectStore,
  identity: RequestIdentity,
  projectId: string,
) {
  const project = await store.getProject(
    identity.ownerId,
    projectId,
    identity.token,
    identity.signal,
  );
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

export function modelHttpError(error: unknown) {
  if (!(error instanceof ModelProviderError)) return error;
  if (error.code === 'MODEL_NOT_CONFIGURED') {
    return new HttpError(503, error.code, 'AI generation is not configured yet.');
  }
  if (error.code === 'MODEL_INVALID_RESPONSE') {
    return new HttpError(502, error.code, 'The AI response did not match the required contract.');
  }
  return new HttpError(502, error.code, 'The AI provider is temporarily unavailable.');
}
