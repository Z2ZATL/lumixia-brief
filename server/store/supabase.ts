import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { projectSchema, type Project } from '../../shared/contracts.js';
import type { NotionConnection, NotionSyncRecord, ProjectStore } from './types.js';

type JsonRecord = Record<string, unknown>;

export class SupabaseProjectStore implements ProjectStore {
  constructor(
    private readonly url: string,
    private readonly publishableKey: string,
  ) {}

  private client(token?: string): SupabaseClient {
    if (!token) throw new Error('SUPABASE_JWT_REQUIRED');
    return createClient(this.url, this.publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async listProjects(ownerId: string, token?: string): Promise<Project[]> {
    const { data, error } = await this.client(token)
      .from('projects')
      .select('document')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => projectSchema.parse(row.document));
  }

  async getProject(ownerId: string, projectId: string, token?: string): Promise<Project | null> {
    const { data, error } = await this.client(token)
      .from('projects')
      .select('document')
      .eq('owner_id', ownerId)
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw error;
    return data ? projectSchema.parse(data.document) : null;
  }

  async createProject(project: Project, token?: string): Promise<Project> {
    const { error } = await this.client(token).from('projects').insert(this.projectRow(project));
    if (error) throw error;
    return project;
  }

  async saveProject(project: Project, token?: string): Promise<Project> {
    const { data, error } = await this.client(token)
      .from('projects')
      .update(this.projectRow(project))
      .eq('id', project.id)
      .eq('owner_id', project.ownerId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('PROJECT_NOT_FOUND');
    return project;
  }

  async deleteProject(ownerId: string, projectId: string, token?: string): Promise<boolean> {
    const { data, error } = await this.client(token)
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('owner_id', ownerId)
      .select('id');
    if (error) throw error;
    return Boolean(data?.length);
  }

  async claimAnswer(
    ownerId: string,
    projectId: string,
    clientAnswerId: string,
    token?: string,
  ): Promise<boolean> {
    const { error } = await this.client(token).from('answer_claims').insert({
      owner_id: ownerId,
      project_id: projectId,
      client_answer_id: clientAnswerId,
    });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw error;
  }

  async getNotionConnection(ownerId: string, token?: string): Promise<NotionConnection | null> {
    const { data, error } = await this.client(token)
      .from('notion_connections')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      ownerId: data.owner_id,
      accessTokenEncrypted: data.access_token_encrypted,
      refreshTokenEncrypted: data.refresh_token_encrypted,
      workspaceId: data.workspace_id,
      workspaceName: data.workspace_name,
      botId: data.bot_id,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async saveNotionConnection(connection: NotionConnection, token?: string): Promise<void> {
    const { error } = await this.client(token).from('notion_connections').upsert({
      owner_id: connection.ownerId,
      access_token_encrypted: connection.accessTokenEncrypted,
      refresh_token_encrypted: connection.refreshTokenEncrypted,
      workspace_id: connection.workspaceId,
      workspace_name: connection.workspaceName,
      bot_id: connection.botId,
      expires_at: connection.expiresAt,
      updated_at: connection.updatedAt,
    });
    if (error) throw error;
  }

  async deleteNotionConnection(ownerId: string, token?: string): Promise<void> {
    const { error } = await this.client(token)
      .from('notion_connections')
      .delete()
      .eq('owner_id', ownerId);
    if (error) throw error;
  }

  async getNotionSync(
    ownerId: string,
    projectId: string,
    briefVersion: number,
    token?: string,
  ): Promise<NotionSyncRecord | null> {
    const { data, error } = await this.client(token)
      .from('notion_syncs')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('project_id', projectId)
      .eq('brief_version', briefVersion)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          ownerId: data.owner_id,
          projectId: data.project_id,
          briefVersion: data.brief_version,
          notionPageId: data.notion_page_id,
          status: data.status,
          errorCode: data.error_code,
          updatedAt: data.updated_at,
        }
      : null;
  }

  async saveNotionSync(record: NotionSyncRecord, token?: string): Promise<void> {
    const { error } = await this.client(token).from('notion_syncs').upsert(
      {
        owner_id: record.ownerId,
        project_id: record.projectId,
        brief_version: record.briefVersion,
        notion_page_id: record.notionPageId,
        status: record.status,
        error_code: record.errorCode,
        updated_at: record.updatedAt,
      },
      { onConflict: 'project_id,brief_version' },
    );
    if (error) throw error;
  }

  async ping(token?: string): Promise<boolean> {
    if (!token) return false;
    const { error } = await this.client(token).rpc('readiness_probe');
    return !error;
  }

  private projectRow(project: Project): JsonRecord {
    return {
      id: project.id,
      owner_id: project.ownerId,
      title: project.title,
      workflow_status: project.workflowStatus,
      sync_status: project.syncStatus,
      document: project,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    };
  }
}
