import type { Project } from '../../shared/contracts.js';
import {
  ProjectVersionConflictError,
  type NotionConnection,
  type NotionSyncClaim,
  type NotionSyncRecord,
  type InterviewTurnClaim,
  type InterviewTurnStatus,
  type ProjectStore,
} from './types.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Project>();
  private readonly answerClaims = new Map<
    string,
    {
      ownerId: string;
      projectId: string;
      payload: Record<string, unknown>;
      status: InterviewTurnStatus;
      result: Project | null;
      errorCode: string | null;
      leaseExpiresAt: number;
    }
  >();
  private readonly notionConnections = new Map<string, NotionConnection>();
  private readonly notionSyncs = new Map<string, NotionSyncRecord>();

  async listProjects(ownerId: string): Promise<Project[]> {
    return [...this.projects.values()]
      .filter((project) => project.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone);
  }

  async getProject(ownerId: string, projectId: string): Promise<Project | null> {
    const project = this.projects.get(projectId);
    return project?.ownerId === ownerId ? clone(project) : null;
  }

  async createProject(project: Project): Promise<Project> {
    if (this.projects.has(project.id)) throw new Error('PROJECT_EXISTS');
    this.projects.set(project.id, clone(project));
    return clone(project);
  }

  async saveProject(project: Project): Promise<Project> {
    const existing = this.projects.get(project.id);
    if (!existing || existing.ownerId !== project.ownerId) throw new Error('PROJECT_NOT_FOUND');
    if (existing.revision !== project.revision) throw new ProjectVersionConflictError();
    const next = { ...clone(project), revision: project.revision + 1 };
    this.projects.set(project.id, next);
    project.revision = next.revision;
    return clone(next);
  }

  async deleteProject(ownerId: string, projectId: string): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project || project.ownerId !== ownerId) return false;
    return this.projects.delete(projectId);
  }

  async claimInterviewTurn(
    ownerId: string,
    projectId: string,
    clientAnswerId: string,
    payload: Record<string, unknown>,
    retryFailed: boolean,
  ): Promise<InterviewTurnClaim> {
    const key = `${ownerId}:${projectId}:${clientAnswerId}`;
    const existing = this.answerClaims.get(key);
    const now = Date.now();
    if (existing) {
      if (existing.status === 'failed' && retryFailed) {
        existing.payload = clone(payload);
        existing.status = 'pending';
        existing.result = null;
        existing.errorCode = null;
        existing.leaseExpiresAt = now + 45_000;
        return { state: 'claimed', status: 'pending', result: null, errorCode: null };
      }
      if (JSON.stringify(existing.payload) !== JSON.stringify(payload)) {
        return { state: 'conflict', status: existing.status, result: null, errorCode: null };
      }
      const retryable = existing.status === 'pending' && existing.leaseExpiresAt <= now;
      if (retryable) {
        existing.status = 'pending';
        existing.errorCode = null;
        existing.leaseExpiresAt = now + 45_000;
        return { state: 'claimed', status: 'pending', result: null, errorCode: null };
      }
      return {
        state: 'duplicate',
        status: existing.status,
        result: existing.result ? clone(existing.result) : null,
        errorCode: existing.errorCode,
      };
    }
    const pending = [...this.answerClaims.values()].find(
      (claim) =>
        claim.ownerId === ownerId &&
        claim.projectId === projectId &&
        claim.status === 'pending' &&
        claim.leaseExpiresAt > now,
    );
    if (pending) return { state: 'busy', status: 'pending', result: null, errorCode: null };
    this.answerClaims.set(key, {
      ownerId,
      projectId,
      payload: clone(payload),
      status: 'pending',
      result: null,
      errorCode: null,
      leaseExpiresAt: now + 45_000,
    });
    return { state: 'claimed', status: 'pending', result: null, errorCode: null };
  }

  async completeInterviewTurn(
    ownerId: string,
    projectId: string,
    clientAnswerId: string,
    status: Exclude<InterviewTurnStatus, 'pending'>,
    result: Project,
    errorCode: string | null,
  ): Promise<void> {
    const claim = this.answerClaims.get(`${ownerId}:${projectId}:${clientAnswerId}`);
    if (!claim) throw new Error('TURN_NOT_CLAIMED');
    claim.status = status;
    claim.result = clone(result);
    claim.errorCode = errorCode;
  }

  async getNotionConnection(ownerId: string): Promise<NotionConnection | null> {
    const connection = this.notionConnections.get(ownerId);
    return connection ? clone(connection) : null;
  }

  async saveNotionConnection(connection: NotionConnection): Promise<void> {
    this.notionConnections.set(connection.ownerId, clone(connection));
  }

  async deleteNotionConnection(ownerId: string): Promise<void> {
    this.notionConnections.delete(ownerId);
  }

  async claimNotionSync(record: NotionSyncRecord): Promise<NotionSyncClaim> {
    const key = `${record.ownerId}:${record.projectId}:${record.briefVersion}`;
    const existing = this.notionSyncs.get(key);
    if (existing?.contentHash && existing.contentHash !== record.contentHash) {
      return { state: 'conflict', record: clone(existing) };
    }
    if (existing?.status === 'synced') return { state: 'synced', record: clone(existing) };
    if (
      existing?.status === 'syncing' &&
      existing.leaseExpiresAt &&
      Date.parse(existing.leaseExpiresAt) > Date.now()
    ) {
      return { state: 'syncing', record: clone(existing) };
    }
    const claimed = {
      ...record,
      notionPageId: existing?.notionPageId ?? record.notionPageId,
      status: 'syncing' as const,
    };
    this.notionSyncs.set(key, clone(claimed));
    return { state: 'claimed', record: clone(claimed) };
  }

  async completeNotionSync(record: NotionSyncRecord): Promise<void> {
    const key = `${record.ownerId}:${record.projectId}:${record.briefVersion}`;
    const existing = this.notionSyncs.get(key);
    if (!existing || existing.operationId !== record.operationId) {
      throw new Error('NOTION_OPERATION_NOT_CLAIMED');
    }
    this.notionSyncs.set(key, clone(record));
  }
}
