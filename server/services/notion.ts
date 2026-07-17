import { createHash, randomUUID } from 'node:crypto';
import type { Project } from '../../shared/contracts.js';
import type { AppConfig } from '../config.js';
import { assertCanSync } from '../domain/workflow.js';
import { HttpError } from '../http.js';
import { NotionApiError, type NotionProvider } from '../providers/notion.js';
import type { RequestIdentity } from '../routes/request.js';
import { decryptSecret, encryptSecret } from '../security/encryption.js';
import type { NotionConnection, NotionSyncClaim, ProjectStore } from '../store/types.js';
import { getOwnedProject, touch, workflowHttpError } from './support.js';

interface UsableConnection {
  accessToken: string;
  connection: NotionConnection;
}

export interface NotionSyncResult {
  httpStatus: 200 | 202;
  project: Project;
  pageId: string | null;
  status: 'synced' | 'syncing';
  idempotent: boolean;
}

export class NotionService {
  constructor(
    private readonly store: ProjectStore,
    private readonly notion: NotionProvider,
    private readonly config: AppConfig,
  ) {}

  authorizationUrl(identity: RequestIdentity) {
    return this.notion.authorizationUrl(identity.ownerId);
  }

  async status(identity: RequestIdentity) {
    const connection = await this.store.getNotionConnection(
      identity.ownerId,
      identity.token,
      identity.signal,
    );
    return { connected: Boolean(connection), workspaceName: connection?.workspaceName ?? null };
  }

  async listPages(identity: RequestIdentity) {
    const { accessToken } = await this.usableConnection(identity);
    try {
      return await this.notion.listPages(accessToken, identity.signal);
    } catch (error) {
      if (!(error instanceof NotionApiError) || error.status !== 401) throw error;
      const refreshed = await this.usableConnection(identity, true);
      return this.notion.listPages(refreshed.accessToken, identity.signal);
    }
  }

  async completeOAuth(identity: RequestIdentity, code: string, state: string) {
    this.verifyOAuthState(identity, state);
    const response = await this.notion.exchangeCode(code, identity.signal);
    const now = new Date();
    await this.store.saveNotionConnection(
      {
        ownerId: identity.ownerId,
        accessTokenEncrypted: encryptSecret(response.access_token, this.encryptionKey()),
        refreshTokenEncrypted: response.refresh_token
          ? encryptSecret(response.refresh_token, this.encryptionKey())
          : null,
        workspaceId: response.workspace_id,
        workspaceName: response.workspace_name ?? null,
        botId: response.bot_id ?? null,
        expiresAt: response.expires_in
          ? new Date(now.getTime() + response.expires_in * 1000).toISOString()
          : null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      identity.token,
      identity.signal,
    );
  }

  rejectOAuth(identity: RequestIdentity, state: string) {
    this.verifyOAuthState(identity, state);
  }

  disconnect(identity: RequestIdentity) {
    return this.store.deleteNotionConnection(identity.ownerId, identity.token, identity.signal);
  }

  async selectParent(identity: RequestIdentity, projectId: string, parentId: string) {
    const project = await getOwnedProject(this.store, identity, projectId);
    project.notionParentId = parentId;
    touch(project);
    return this.store.saveProject(project, identity.token, identity.signal);
  }

  async sync(identity: RequestIdentity, projectId: string): Promise<NotionSyncResult> {
    const project = await getOwnedProject(this.store, identity, projectId);
    try {
      assertCanSync(project);
    } catch (error) {
      throw workflowHttpError(error);
    }
    const brief = project.briefVersions.at(-1)!;
    const connection = await this.usableConnection(identity);
    const contentHash = createHash('sha256')
      .update(JSON.stringify({ title: brief.title, sections: brief.sections }))
      .digest('hex');
    const claim = await this.claimSync(identity, project, brief.version, contentHash);
    const existing = await this.resolveClaim(identity, project, claim);
    if (existing) return existing;
    project.syncStatus = 'syncing';
    touch(project);
    await this.store.saveProject(project, identity.token, identity.signal);
    const pageId = await this.performSync(identity, project, connection, claim, contentHash);
    return this.completeSuccess(identity, project, claim, pageId);
  }

  private claimSync(
    identity: RequestIdentity,
    project: Project,
    briefVersion: number,
    contentHash: string,
  ) {
    const now = new Date().toISOString();
    return this.store.claimNotionSync(
      {
        ownerId: identity.ownerId,
        projectId: project.id,
        briefVersion,
        notionPageId: project.notionPageId,
        status: 'syncing',
        errorCode: null,
        operationId: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        contentHash,
        updatedAt: now,
      },
      identity.token,
      identity.signal,
    );
  }

  private async resolveClaim(
    identity: RequestIdentity,
    project: Project,
    claim: NotionSyncClaim,
  ): Promise<NotionSyncResult | null> {
    if (claim.state === 'conflict') {
      throw new HttpError(
        409,
        'SYNC_CONTENT_CONFLICT',
        'The approved version changed after sync was claimed.',
      );
    }
    if (claim.state === 'syncing') {
      project.syncStatus = 'syncing';
      return this.result(202, project, claim.record.notionPageId, 'syncing', true);
    }
    if (claim.state !== 'synced' || !claim.record.notionPageId) return null;
    project.notionPageId = claim.record.notionPageId;
    project.syncStatus = 'synced';
    project.lastSyncError = null;
    touch(project);
    const saved = await this.store.saveProject(project, identity.token, identity.signal);
    return this.result(200, saved, claim.record.notionPageId, 'synced', true);
  }

  private async performSync(
    identity: RequestIdentity,
    project: Project,
    connection: UsableConnection,
    claim: NotionSyncClaim,
    contentHash: string,
  ) {
    const brief = project.briefVersions.at(-1)!;
    const input = {
      accessToken: connection.accessToken,
      parentId: project.notionParentId!,
      existingPageId: claim.record.notionPageId ?? project.notionPageId,
      projectId: project.id,
      title: brief.title,
      sections: brief.sections,
      version: brief.version,
      contentHash,
      ...(identity.signal ? { signal: identity.signal } : {}),
    };
    try {
      try {
        return await this.notion.syncBriefVersion(input);
      } catch (error) {
        if (!(error instanceof NotionApiError) || error.status !== 401) throw error;
        const refreshed = await this.usableConnection(identity, true);
        return await this.notion.syncBriefVersion({ ...input, accessToken: refreshed.accessToken });
      }
    } catch (error) {
      await this.completeFailure(identity, project, claim, error);
      throw new HttpError(
        502,
        'NOTION_SYNC_FAILED',
        'Notion sync failed and can be retried safely.',
      );
    }
  }

  private async completeFailure(
    identity: RequestIdentity,
    project: Project,
    claim: NotionSyncClaim,
    error: unknown,
  ) {
    const code = error instanceof NotionApiError ? error.message : 'NOTION_UNAVAILABLE';
    await this.store.completeNotionSync(
      {
        ...claim.record,
        status: 'error',
        errorCode: code,
        leaseExpiresAt: null,
        updatedAt: new Date().toISOString(),
      },
      identity.token,
      identity.signal,
    );
    project.syncStatus = 'error';
    project.lastSyncError = code;
    touch(project);
    await this.store.saveProject(project, identity.token, identity.signal);
  }

  private async completeSuccess(
    identity: RequestIdentity,
    project: Project,
    claim: NotionSyncClaim,
    pageId: string,
  ): Promise<NotionSyncResult> {
    await this.store.completeNotionSync(
      {
        ...claim.record,
        notionPageId: pageId,
        status: 'synced',
        errorCode: null,
        leaseExpiresAt: null,
        updatedAt: new Date().toISOString(),
      },
      identity.token,
      identity.signal,
    );
    project.notionPageId = pageId;
    project.syncStatus = 'synced';
    project.lastSyncError = null;
    touch(project);
    const saved = await this.store.saveProject(project, identity.token, identity.signal);
    return this.result(200, saved, pageId, 'synced', false);
  }

  private result(
    httpStatus: 200 | 202,
    project: Project,
    pageId: string | null,
    status: 'synced' | 'syncing',
    idempotent: boolean,
  ): NotionSyncResult {
    return { httpStatus, project, pageId, status, idempotent };
  }

  private async usableConnection(
    identity: RequestIdentity,
    forceRefresh = false,
  ): Promise<UsableConnection> {
    const connection = await this.store.getNotionConnection(
      identity.ownerId,
      identity.token,
      identity.signal,
    );
    if (!connection) throw new HttpError(409, 'NOTION_NOT_CONNECTED', 'Connect Notion first.');
    const expired = Boolean(connection.expiresAt && Date.parse(connection.expiresAt) <= Date.now());
    if (!forceRefresh && !expired) {
      return { accessToken: this.decrypt(connection.accessTokenEncrypted), connection };
    }
    return this.refreshConnection(identity, connection);
  }

  private async refreshConnection(identity: RequestIdentity, connection: NotionConnection) {
    if (!connection.refreshTokenEncrypted) {
      throw new HttpError(401, 'NOTION_RECONNECT_REQUIRED', 'Reconnect Notion to continue.');
    }
    const refreshed = await this.notion.refreshToken(
      this.decrypt(connection.refreshTokenEncrypted),
      identity.signal,
    );
    const now = new Date();
    const updated: NotionConnection = {
      ...connection,
      accessTokenEncrypted: encryptSecret(refreshed.access_token, this.encryptionKey()),
      refreshTokenEncrypted: refreshed.refresh_token
        ? encryptSecret(refreshed.refresh_token, this.encryptionKey())
        : connection.refreshTokenEncrypted,
      workspaceId: refreshed.workspace_id || connection.workspaceId,
      workspaceName: refreshed.workspace_name ?? connection.workspaceName,
      botId: refreshed.bot_id ?? connection.botId,
      expiresAt: refreshed.expires_in
        ? new Date(now.getTime() + refreshed.expires_in * 1000).toISOString()
        : null,
      updatedAt: now.toISOString(),
    };
    await this.store.saveNotionConnection(updated, identity.token, identity.signal);
    return { accessToken: refreshed.access_token, connection: updated };
  }

  private encryptionKey() {
    return this.config.TOKEN_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString('base64');
  }

  private decrypt(value: string) {
    return decryptSecret(value, this.encryptionKey());
  }

  private verifyOAuthState(identity: RequestIdentity, state: string) {
    try {
      this.notion.verifyState(state, identity.ownerId);
    } catch {
      throw new HttpError(400, 'INVALID_OAUTH_STATE', 'The Notion authorization state is invalid.');
    }
  }
}
