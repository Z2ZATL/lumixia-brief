import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  briefVersionSchema,
  editBriefInputSchema,
  requestChangesInputSchema,
  type BriefVersion,
  type GeneratedBrief,
} from '../../shared/contracts.js';
import { confidenceScore, isReadyToBrief } from '../domain/confidence.js';
import { assertCanApprove, assertCanGenerate } from '../domain/workflow.js';
import { HttpError } from '../http.js';
import type { ModelProvider } from '../providers/model.js';
import type { RequestIdentity } from '../routes/request.js';
import type { ProjectStore } from '../store/types.js';
import { getOwnedProject, modelHttpError, touch, workflowHttpError } from './support.js';

type EditBriefInput = z.infer<typeof editBriefInputSchema>;
type RequestChangesInput = z.infer<typeof requestChangesInputSchema>;

export class BriefService {
  constructor(
    private readonly store: ProjectStore,
    private readonly model: ModelProvider,
  ) {}

  async list(identity: RequestIdentity, projectId: string) {
    const project = await getOwnedProject(this.store, identity, projectId);
    return project.briefVersions;
  }

  async generate(identity: RequestIdentity, projectId: string) {
    const project = await getOwnedProject(this.store, identity, projectId);
    try {
      assertCanGenerate(project);
    } catch (error) {
      throw workflowHttpError(error);
    }
    const latest = project.briefVersions.at(-1);
    if (latest?.status === 'draft') {
      return { httpStatus: 200 as const, project, brief: latest, idempotent: true };
    }
    let generated: Awaited<ReturnType<ModelProvider['generateBrief']>>;
    try {
      generated = await this.model.generateBrief(project, identity.signal);
    } catch (error) {
      throw modelHttpError(error);
    }
    const brief = this.createBrief(project, generated, latest);
    project.briefVersions.push(briefVersionSchema.parse(brief));
    project.workflowStatus = 'needs_review';
    touch(project);
    const saved = await this.store.saveProject(project, identity.token, identity.signal);
    return { httpStatus: 201 as const, project: saved, brief, idempotent: false };
  }

  async generateFromCodex(identity: RequestIdentity, projectId: string, generated: GeneratedBrief) {
    const project = await getOwnedProject(this.store, identity, projectId);
    try {
      assertCanGenerate(project);
    } catch (error) {
      throw workflowHttpError(error);
    }
    const latest = project.briefVersions.at(-1);
    if (latest?.status === 'draft') {
      if (latest.title !== generated.title || !sameSections(latest.sections, generated.sections)) {
        throw new HttpError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'A different brief draft already exists and must be reviewed or revised first.',
        );
      }
      return { httpStatus: 200 as const, project, brief: latest, idempotent: true };
    }
    const brief = this.createBrief(project, generated, latest);
    project.briefVersions.push(briefVersionSchema.parse(brief));
    project.workflowStatus = 'needs_review';
    touch(project);
    const saved = await this.store.saveProject(project, identity.token, identity.signal);
    return { httpStatus: 201 as const, project: saved, brief, idempotent: false };
  }

  async edit(identity: RequestIdentity, projectId: string, input: EditBriefInput) {
    const project = await getOwnedProject(this.store, identity, projectId);
    const latest = project.briefVersions.at(-1);
    if (!latest || latest.version !== input.expectedVersion) {
      throw new HttpError(409, 'VERSION_CONFLICT', 'The brief changed. Reload before editing.');
    }
    const editable = this.editableVersion(project, latest, input);
    project.workflowStatus = 'needs_review';
    project.syncStatus = 'not_synced';
    touch(project);
    return {
      project: await this.store.saveProject(project, identity.token, identity.signal),
      brief: editable,
    };
  }

  async approve(identity: RequestIdentity, projectId: string) {
    const project = await getOwnedProject(this.store, identity, projectId);
    try {
      assertCanApprove(project);
    } catch (error) {
      throw workflowHttpError(error);
    }
    const latest = project.briefVersions.at(-1)!;
    latest.status = 'approved';
    latest.approvedAt = new Date().toISOString();
    latest.approvedBy = identity.ownerId;
    latest.updatedAt = latest.approvedAt;
    project.workflowStatus = 'approved';
    project.syncStatus = 'not_synced';
    touch(project);
    return {
      project: await this.store.saveProject(project, identity.token, identity.signal),
      brief: latest,
    };
  }

  async requestChanges(identity: RequestIdentity, projectId: string, input: RequestChangesInput) {
    const project = await getOwnedProject(this.store, identity, projectId);
    const latest = project.briefVersions.at(-1);
    if (!latest) throw new HttpError(409, 'BRIEF_REQUIRED', 'Generate a brief first.');
    if (latest.status === 'draft') latest.status = 'superseded';
    project.workflowStatus = 'interviewing';
    project.syncStatus = 'not_synced';
    project.currentQuestion = {
      text: this.revisionQuestion(project.locale, input),
      dimension: input.dimension,
      rationale: 'A human reviewer requested a focused revision.',
    };
    project.analysis.shouldStop = false;
    project.analysis.stopReason = 'needs_human';
    project.analysis.nextQuestion = project.currentQuestion;
    touch(project);
    return this.store.saveProject(project, identity.token, identity.signal);
  }

  private createBrief(
    project: Awaited<ReturnType<typeof getOwnedProject>>,
    generated: Awaited<ReturnType<ModelProvider['generateBrief']>>,
    latest: BriefVersion | undefined,
  ): BriefVersion {
    const initialScore = confidenceScore(project.initialAssessments);
    const finalScore = confidenceScore(project.analysis.dimensionAssessments);
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      projectId: project.id,
      version: (latest?.version ?? 0) + 1,
      title: generated.title,
      sections: generated.sections,
      status: 'draft',
      clarificationLabel: isReadyToBrief(project.analysis, project.answers.length)
        ? 'ready'
        : 'needs_clarification',
      alignment: {
        initialScore,
        finalScore,
        delta: finalScore - initialScore,
        assumptionsSurfaced: project.analysis.assumptions.length,
        contradictionsResolved: project.analysis.contradictions.filter((item) => item.resolved)
          .length,
        humanDecisionsRemaining: project.analysis.assumptions.filter(
          (item) => item.needsHumanDecision,
        ).length,
      },
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      approvedBy: null,
    };
  }

  private editableVersion(
    project: Awaited<ReturnType<typeof getOwnedProject>>,
    latest: BriefVersion,
    input: EditBriefInput,
  ) {
    if (latest.status === 'approved') {
      const now = new Date().toISOString();
      const editable: BriefVersion = {
        ...latest,
        id: randomUUID(),
        version: latest.version + 1,
        status: 'draft',
        title: input.title,
        sections: input.sections,
        approvedAt: null,
        approvedBy: null,
        createdAt: now,
        updatedAt: now,
      };
      project.briefVersions.push(editable);
      return editable;
    }
    if (latest.status !== 'draft') {
      throw new HttpError(409, 'BRIEF_IMMUTABLE', 'This brief version is immutable.');
    }
    latest.title = input.title;
    latest.sections = input.sections;
    latest.updatedAt = new Date().toISOString();
    return latest;
  }

  private revisionQuestion(locale: 'en' | 'th', input: RequestChangesInput) {
    return locale === 'th'
      ? `ต้องแก้ส่วน ${input.section}: ${input.reason} กรุณาระบุข้อมูลที่ถูกต้องเพื่อใช้แทนที่`
      : `For ${input.section}, you requested: “${input.reason}”. What should the brief use instead?`;
  }
}

function sameSections(left: BriefVersion['sections'], right: BriefVersion['sections']): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
