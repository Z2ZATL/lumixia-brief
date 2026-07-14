import type { Project } from '../../shared/contracts.js';

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
  updatedAt: string;
}

export interface ProjectStore {
  listProjects(ownerId: string, token?: string): Promise<Project[]>;
  getProject(ownerId: string, projectId: string, token?: string): Promise<Project | null>;
  createProject(project: Project, token?: string): Promise<Project>;
  saveProject(project: Project, token?: string): Promise<Project>;
  deleteProject(ownerId: string, projectId: string, token?: string): Promise<boolean>;
  claimAnswer(
    ownerId: string,
    projectId: string,
    clientAnswerId: string,
    token?: string,
  ): Promise<boolean>;
  getNotionConnection(ownerId: string, token?: string): Promise<NotionConnection | null>;
  saveNotionConnection(connection: NotionConnection, token?: string): Promise<void>;
  deleteNotionConnection(ownerId: string, token?: string): Promise<void>;
  getNotionSync(
    ownerId: string,
    projectId: string,
    briefVersion: number,
    token?: string,
  ): Promise<NotionSyncRecord | null>;
  saveNotionSync(record: NotionSyncRecord, token?: string): Promise<void>;
  ping(token?: string): Promise<boolean>;
}
