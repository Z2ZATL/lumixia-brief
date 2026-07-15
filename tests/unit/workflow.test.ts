import { describe, expect, it } from 'vitest';
import { emptyBriefSections } from '../../shared/contracts.js';
import {
  assertCanApprove,
  assertCanGenerate,
  assertCanSync,
  WorkflowConflict,
} from '../../server/domain/workflow.js';
import { makeProject } from '../ui/fixtures.js';

function processedProject(count = 5) {
  const project = makeProject();
  project.answers = Array.from({ length: count }, (_, index) => ({
    id: `answer-${index}`,
    clientAnswerId: `client-${index}`,
    question: `Question ${index}`,
    dimension: 'problem' as const,
    text: `Answer ${index}`,
    status: 'processed' as const,
    errorCode: null,
    createdAt: project.createdAt,
    processedAt: project.updatedAt,
  }));
  project.analysis.dimensionAssessments = project.analysis.dimensionAssessments.map((item) => ({
    ...item,
    level: 'clear',
  }));
  return project;
}

describe('workflow guards', () => {
  it('enforces the answer threshold, readiness, maximum-question escape, and immutability', () => {
    expect(() => assertCanGenerate(processedProject(4))).toThrow(WorkflowConflict);
    const unclear = processedProject(5);
    unclear.analysis.dimensionAssessments[0]!.level = 'missing';
    expect(() => assertCanGenerate(unclear)).toThrow('Continue the interview');
    expect(() => assertCanGenerate(processedProject(5))).not.toThrow();
    expect(() => assertCanGenerate(processedProject(12))).not.toThrow();
    const approved = processedProject(5);
    approved.workflowStatus = 'approved';
    expect(() => assertCanGenerate(approved)).toThrow('Create a revision');
  });

  it('allows only a current draft to be approved', () => {
    const project = makeProject(true);
    expect(() => assertCanApprove(project)).not.toThrow();
    project.briefVersions[0]!.status = 'approved';
    expect(() => assertCanApprove(project)).toThrow('Only the current draft');
    project.briefVersions = [];
    expect(() => assertCanApprove(project)).toThrow('Only the current draft');
  });

  it('requires an approved immutable brief and Notion parent before sync', () => {
    const project = makeProject(true);
    expect(() => assertCanSync(project)).toThrow('immutable approved');
    project.briefVersions[0] = {
      ...project.briefVersions[0]!,
      status: 'approved',
      sections: emptyBriefSections,
    };
    project.workflowStatus = 'approved';
    expect(() => assertCanSync(project)).toThrow('Select a Notion parent');
    project.notionParentId = 'parent';
    expect(() => assertCanSync(project)).not.toThrow();
  });
});
