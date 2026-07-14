import type { Project } from '../../shared/contracts.js';
import { isReadyToBrief } from './confidence.js';

export class WorkflowConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowConflict';
  }
}

export function assertCanGenerate(project: Project) {
  const processed = project.answers.filter((answer) => answer.status === 'processed').length;
  if (processed < 5) {
    throw new WorkflowConflict('At least five processed answers are required.');
  }
  if (!isReadyToBrief(project.analysis, processed) && project.answers.length < 12) {
    throw new WorkflowConflict(
      'Continue the interview until the brief is ready or 12 questions are reached.',
    );
  }
  if (project.workflowStatus === 'approved') {
    throw new WorkflowConflict('Create a revision before replacing an approved snapshot.');
  }
}

export function assertCanApprove(project: Project) {
  const latest = project.briefVersions.at(-1);
  if (!latest || latest.status !== 'draft') {
    throw new WorkflowConflict('Only the current draft can be approved.');
  }
}

export function assertCanSync(project: Project) {
  const latest = project.briefVersions.at(-1);
  if (!latest || latest.status !== 'approved' || project.workflowStatus !== 'approved') {
    throw new WorkflowConflict('An immutable approved version is required before sync.');
  }
  if (!project.notionParentId) {
    throw new WorkflowConflict('Select a Notion parent page before sync.');
  }
}
