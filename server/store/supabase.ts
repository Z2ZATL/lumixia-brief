import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { projectSchema, type Project } from '../../shared/contracts.js';
import {
  ProjectVersionConflictError,
  type InterviewTurnClaim,
  type InterviewTurnStatus,
  type NotionConnection,
  type NotionSyncClaim,
  type NotionSyncRecord,
  type ProjectStore,
} from './types.js';

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
      .select('document,revision')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) =>
      projectSchema.parse({ ...(row.document as JsonRecord), revision: row.revision }),
    );
  }

  async getProject(ownerId: string, projectId: string, token?: string): Promise<Project | null> {
    const { data, error } = await this.client(token)
      .from('projects')
      .select('document,revision')
      .eq('owner_id', ownerId)
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? projectSchema.parse({ ...(data.document as JsonRecord), revision: data.revision })
      : null;
  }

  async createProject(project: Project, token?: string): Promise<Project> {
    const { error } = await this.client(token).from('projects').insert(this.projectRow(project));
    if (error) throw error;
    return project;
  }

  async saveProject(project: Project, token?: string): Promise<Project> {
    const expectedRevision = project.revision;
    const next = { ...project, revision: expectedRevision + 1 };
    const { data, error } = await this.client(token).rpc('compare_and_save_project', {
      p_owner_id: project.ownerId,
      p_project_id: project.id,
      p_expected_revision: expectedRevision,
      p_document: next,
      p_title: next.title,
      p_workflow_status: next.workflowStatus,
      p_sync_status: next.syncStatus,
      p_updated_at: next.updatedAt,
    });
    if (error) throw error;
    if (data !== 1) throw new ProjectVersionConflictError();
    project.revision = next.revision;
    return next;
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

  async claimInterviewTurn(
    ownerId: string,
    projectId: string,
    clientAnswerId: string,
    payload: Record<string, unknown>,
    retryFailed: boolean,
    token?: string,
  ): Promise<InterviewTurnClaim> {
    const { data, error } = await this.client(token).rpc('claim_interview_turn', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_client_answer_id: clientAnswerId,
      p_payload: payload,
      p_retry_failed: retryFailed,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('TURN_CLAIM_FAILED');
    return {
      state: row.claim_state,
      status: row.turn_status,
      result: row.turn_result ? projectSchema.parse(row.turn_result) : null,
      errorCode: row.turn_error_code,
    };
  }

  async completeInterviewTurn(
    ownerId: string,
    projectId: string,
    clientAnswerId: string,
    status: Exclude<InterviewTurnStatus, 'pending'>,
    result: Project,
    errorCode: string | null,
    token?: string,
  ): Promise<void> {
    const { data, error } = await this.client(token).rpc('complete_interview_turn', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_client_answer_id: clientAnswerId,
      p_status: status,
      p_result: result,
      p_error_code: errorCode,
    });
    if (error) throw error;
    if (!data) throw new Error('TURN_NOT_CLAIMED');
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

  async claimNotionSync(record: NotionSyncRecord, token?: string): Promise<NotionSyncClaim> {
    const { data, error } = await this.client(token).rpc('claim_notion_sync', {
      p_owner_id: record.ownerId,
      p_project_id: record.projectId,
      p_brief_version: record.briefVersion,
      p_operation_id: record.operationId,
      p_content_hash: record.contentHash,
      p_known_page_id: record.notionPageId,
      p_lease_expires_at: record.leaseExpiresAt,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('NOTION_CLAIM_FAILED');
    const recordRow = row as unknown as Record<string, unknown>;
    const state = recordRow['claim_state'];
    if (!['claimed', 'syncing', 'synced', 'conflict'].includes(String(state))) {
      throw new Error('NOTION_CLAIM_INVALID');
    }
    return {
      state: state as NotionSyncClaim['state'],
      record: this.notionSyncRecord(recordRow),
    };
  }

  async completeNotionSync(record: NotionSyncRecord, token?: string): Promise<void> {
    const { data, error } = await this.client(token).rpc('complete_notion_sync', {
      p_owner_id: record.ownerId,
      p_project_id: record.projectId,
      p_brief_version: record.briefVersion,
      p_operation_id: record.operationId,
      p_notion_page_id: record.notionPageId,
      p_status: record.status,
      p_error_code: record.errorCode,
    });
    if (error) throw error;
    if (!data) throw new Error('NOTION_OPERATION_NOT_CLAIMED');
  }

  private notionSyncRecord(row: Record<string, unknown>): NotionSyncRecord {
    return {
      ownerId: String(row['owner_id']),
      projectId: String(row['project_id']),
      briefVersion: Number(row['brief_version']),
      notionPageId: typeof row['notion_page_id'] === 'string' ? row['notion_page_id'] : null,
      status: row['sync_status'] as NotionSyncRecord['status'],
      errorCode: typeof row['error_code'] === 'string' ? row['error_code'] : null,
      operationId: String(row['operation_id']),
      leaseExpiresAt: typeof row['lease_expires_at'] === 'string' ? row['lease_expires_at'] : null,
      contentHash: String(row['content_hash']),
      updatedAt: String(row['updated_at']),
    };
  }

  private projectRow(project: Project): JsonRecord {
    return {
      id: project.id,
      owner_id: project.ownerId,
      title: project.title,
      workflow_status: project.workflowStatus,
      sync_status: project.syncStatus,
      revision: project.revision,
      document: project,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    };
  }
}
