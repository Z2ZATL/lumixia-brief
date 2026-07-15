import type { Project } from '../../shared/contracts.js';

export class ProjectVersionConflictError extends Error {
  constructor() {
    super('PROJECT_VERSION_CONFLICT');
    this.name = 'ProjectVersionConflictError';
  }
}

export interface NotionConnection {
  ownerId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  workspaceId: string;
  workspaceName: string | null;
  botId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotionSyncRecord {
  ownerId: string;
  projectId: string;
  briefVersion: number;
  notionPageId: string | null;
  status: 'syncing' | 'synced' | 'error';
  errorCode: string | null;
  operationId: string;
  leaseExpiresAt: string | null;
  contentHash: string;
  updatedAt: string;
}

export interface NotionSyncClaim {
  state: 'claimed' | 'syncing' | 'synced' | 'conflict';
  record: NotionSyncRecord;
}

export type InterviewTurnStatus = 'pending' | 'processed' | 'failed';

export interface InterviewTurnClaim {
  state: 'claimed' | 'duplicate' | 'busy' | 'conflict';
  status: InterviewTurnStatus;
  result: Project | null;
  errorCode: string | null;
}

export interface ProjectStore {
  listProjects(ownerId: string, token?: string, signal?: AbortSignal): Promise<Project[]>;
  getProject(
    ownerId: string,
    projectId: string,
    token?: string,
    signal?: AbortSignal,
  ): Promise<Project | null>;
  createProject(project: Project, token?: string, signal?: AbortSignal): Promise<Project>;
  saveProject(project: Project, token?: string, signal?: AbortSignal): Promise<Project>;
  deleteProject(
    ownerId: string,
    projectId: string,
    token?: string,
    signal?: AbortSignal,
  ): Promise<boolean>;
  claimInterviewTurn(
    ownerId: string,
    projectId: string,
    clientAnswerId: string,
    payload: Record<string, unknown>,
    retryFailed: boolean,
    token?: string,
    signal?: AbortSignal,
  ): Promise<InterviewTurnClaim>;
  completeInterviewTurn(
    ownerId: string,
    projectId: string,
    clientAnswerId: string,
    status: Exclude<InterviewTurnStatus, 'pending'>,
    result: Project,
    errorCode: string | null,
    token?: string,
    signal?: AbortSignal,
  ): Promise<void>;
  getNotionConnection(
    ownerId: string,
    token?: string,
    signal?: AbortSignal,
  ): Promise<NotionConnection | null>;
  saveNotionConnection(
    connection: NotionConnection,
    token?: string,
    signal?: AbortSignal,
  ): Promise<void>;
  deleteNotionConnection(ownerId: string, token?: string, signal?: AbortSignal): Promise<void>;
  claimNotionSync(
    record: NotionSyncRecord,
    token?: string,
    signal?: AbortSignal,
  ): Promise<NotionSyncClaim>;
  completeNotionSync(record: NotionSyncRecord, token?: string, signal?: AbortSignal): Promise<void>;
}
