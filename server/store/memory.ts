import type { Project } from '../../shared/contracts.js';
import type { NotionConnection, NotionSyncRecord, ProjectStore } from './types.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Project>();
  private readonly answerClaims = new Set<string>();
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
    this.projects.set(project.id, clone(project));
    return clone(project);
  }

  async deleteProject(ownerId: string, projectId: string): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project || project.ownerId !== ownerId) return false;
    return this.projects.delete(projectId);
  }

  async claimAnswer(ownerId: string, projectId: string, clientAnswerId: string): Promise<boolean> {
    const key = `${ownerId}:${projectId}:${clientAnswerId}`;
    if (this.answerClaims.has(key)) return false;
    this.answerClaims.add(key);
    return true;
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

  async getNotionSync(
    ownerId: string,
    projectId: string,
    briefVersion: number,
  ): Promise<NotionSyncRecord | null> {
    const record = this.notionSyncs.get(`${ownerId}:${projectId}:${briefVersion}`);
    return record ? clone(record) : null;
  }

  async saveNotionSync(record: NotionSyncRecord): Promise<void> {
    this.notionSyncs.set(
      `${record.ownerId}:${record.projectId}:${record.briefVersion}`,
      clone(record),
    );
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
