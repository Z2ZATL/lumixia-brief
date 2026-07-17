import { describe, expect, it } from 'vitest';
import { emptyBriefSections } from '../../shared/contracts.js';
import { loadConfig } from '../../server/config.js';
import { HttpError } from '../../server/http.js';
import { ModelProviderError, MockModelProvider } from '../../server/providers/model.js';
import {
  MockNotionProvider,
  NotionApiError,
  type NotionProvider,
} from '../../server/providers/notion.js';
import { BriefService } from '../../server/services/briefs.js';
import { NotionService } from '../../server/services/notion.js';
import { ProjectService } from '../../server/services/projects.js';
import { MemoryProjectStore } from '../../server/store/memory.js';
import { makeProject } from '../ui/fixtures.js';

const identity = { ownerId: 'user-a' };
const config = loadConfig({
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:5173',
  MODEL_PROVIDER_MODE: 'mock',
  NOTION_PROVIDER_MODE: 'mock',
  DATA_MODE: 'memory',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
});

async function storedProject(withBrief = true) {
  const store = new MemoryProjectStore();
  const project = makeProject(withBrief);
  await store.createProject(project);
  return { store, project };
}

describe('project and brief services', () => {
  it('lists, reads, creates, and deletes owned projects with safe not-found errors', async () => {
    const store = new MemoryProjectStore();
    const service = new ProjectService(store);
    const created = await service.create(identity, {
      title: 'Service project',
      initialPrompt: 'Clarify a scoped workflow.',
      locale: 'en',
    });
    await expect(service.list(identity)).resolves.toHaveLength(1);
    await expect(service.get(identity, created.id)).resolves.toMatchObject({ id: created.id });
    await expect(service.delete(identity, created.id)).resolves.toBeUndefined();
    await expect(service.get(identity, created.id)).rejects.toMatchObject({
      status: 404,
      code: 'PROJECT_NOT_FOUND',
    });
    await expect(service.delete(identity, created.id)).rejects.toBeInstanceOf(HttpError);
  });

  it('edits a draft, rejects stale versions, approves, and clones approved content', async () => {
    const { store, project } = await storedProject();
    const service = new BriefService(store, new MockModelProvider());
    await expect(service.list(identity, project.id)).resolves.toHaveLength(1);
    const edited = await service.edit(identity, project.id, {
      expectedVersion: 1,
      title: 'Edited brief',
      sections: { ...emptyBriefSections, summary: 'Edited summary' },
    });
    expect(edited.brief.title).toBe('Edited brief');
    await expect(
      service.edit(identity, project.id, {
        expectedVersion: 99,
        title: 'Stale edit',
        sections: emptyBriefSections,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const approved = await service.approve(identity, project.id);
    expect(approved.brief.status).toBe('approved');
    const revision = await service.edit(identity, project.id, {
      expectedVersion: 1,
      title: 'Revision two',
      sections: { ...emptyBriefSections, summary: 'Revised summary' },
    });
    expect(revision.brief).toMatchObject({ version: 2, status: 'draft', approvedAt: null });
  });

  it('reopens a focused revision and keeps generated drafts idempotent', async () => {
    const { store, project } = await storedProject();
    const service = new BriefService(store, new MockModelProvider());
    project.answers = Array.from({ length: 5 }, (_, index) => ({
      id: `answer-${index}`,
      clientAnswerId: `client-${index}`,
      question: 'Question',
      dimension: 'problem' as const,
      text: 'Answer',
      status: 'processed' as const,
      errorCode: null,
      createdAt: project.createdAt,
      processedAt: project.updatedAt,
    }));
    project.analysis.dimensionAssessments = project.analysis.dimensionAssessments.map((item) => ({
      ...item,
      level: 'clear',
    }));
    await store.saveProject(project);
    const idempotent = await service.generate(identity, project.id);
    expect(idempotent).toMatchObject({ httpStatus: 200, idempotent: true });
    const revised = await service.requestChanges(identity, project.id, {
      section: 'summary',
      dimension: 'scope',
      reason: 'State the boundary explicitly.',
    });
    expect(revised.workflowStatus).toBe('interviewing');
    expect(revised.briefVersions[0]?.status).toBe('superseded');
    expect(revised.currentQuestion?.dimension).toBe('scope');
    const empty = await storedProject(false);
    await expect(
      new BriefService(empty.store, new MockModelProvider()).requestChanges(
        identity,
        empty.project.id,
        { section: 'summary', dimension: 'scope', reason: 'Missing.' },
      ),
    ).rejects.toMatchObject({ code: 'BRIEF_REQUIRED' });
  });

  it('maps an invalid model response without creating a brief', async () => {
    const { store, project } = await storedProject(false);
    project.answers = Array.from({ length: 12 }, (_, index) => ({
      id: `answer-${index}`,
      clientAnswerId: `client-${index}`,
      question: 'Question',
      dimension: 'problem' as const,
      text: 'Answer',
      status: 'processed' as const,
      errorCode: null,
      createdAt: project.createdAt,
      processedAt: project.updatedAt,
    }));
    await store.saveProject(project);
    const model = {
      analyzeInterview: () => Promise.reject(new Error('unused')),
      generateBrief: () => Promise.reject(new ModelProviderError('MODEL_INVALID_RESPONSE')),
    };
    const service = new BriefService(store, model);
    await expect(service.generate(identity, project.id)).rejects.toMatchObject({
      status: 502,
      code: 'MODEL_INVALID_RESPONSE',
    });
    expect((await store.getProject('user-a', project.id))?.briefVersions).toEqual([]);
  });
});

describe('Notion service failure and lifecycle paths', () => {
  it('connects with encrypted tokens, lists pages, reports status, and disconnects', async () => {
    const store = new MemoryProjectStore();
    const service = new NotionService(store, new MockNotionProvider(), config);
    await expect(service.status(identity)).resolves.toEqual({
      connected: false,
      workspaceName: null,
    });
    await expect(service.completeOAuth(identity, 'code', 'state')).resolves.toBeUndefined();
    const stored = await store.getNotionConnection('user-a');
    expect(stored?.accessTokenEncrypted).not.toContain('mock-token');
    expect(stored?.refreshTokenEncrypted).not.toContain('mock-refresh');
    await expect(service.listPages(identity)).resolves.toHaveLength(2);
    await expect(service.status(identity)).resolves.toMatchObject({ connected: true });
    await service.disconnect(identity);
    await expect(service.status(identity)).resolves.toMatchObject({ connected: false });
  });

  it('refreshes and rotates credentials after a provider 401', async () => {
    class RefreshingProvider extends MockNotionProvider {
      listCalls = 0;
      refreshCalls = 0;
      override async listPages(...args: [accessToken?: string]) {
        const accessToken = args[0] ?? '';
        this.listCalls += 1;
        if (accessToken === 'initial-token') throw new NotionApiError(401, 'NOTION_401');
        return [{ id: 'page', title: 'Recovered parent' }];
      }
      override async exchangeCode() {
        return {
          access_token: 'initial-token',
          refresh_token: 'initial-refresh',
          workspace_id: 'workspace',
        };
      }
      override async refreshToken(...args: [refreshToken?: string]) {
        const refreshToken = args[0] ?? '';
        expect(refreshToken).toBe('initial-refresh');
        this.refreshCalls += 1;
        return {
          access_token: 'rotated-token',
          refresh_token: 'rotated-refresh',
          workspace_id: 'workspace',
          expires_in: 3600,
        };
      }
    }
    const store = new MemoryProjectStore();
    const notion = new RefreshingProvider();
    const service = new NotionService(store, notion, config);
    await service.completeOAuth(identity, 'code', 'state');
    await expect(service.listPages(identity)).resolves.toEqual([
      { id: 'page', title: 'Recovered parent' },
    ]);
    expect(notion.listCalls).toBe(2);
    expect(notion.refreshCalls).toBe(1);
    const connection = await store.getNotionConnection('user-a');
    expect(connection?.accessTokenEncrypted).not.toContain('rotated-token');
    expect(connection?.refreshTokenEncrypted).not.toContain('rotated-refresh');
  });

  it('returns 202 for a concurrent identical sync and completes the original operation once', async () => {
    const { store, project } = await storedProject();
    project.briefVersions[0]!.status = 'approved';
    project.workflowStatus = 'approved';
    project.notionParentId = 'parent';
    await store.saveProject(project);
    let release: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    class SlowNotionProvider extends MockNotionProvider {
      syncCalls = 0;
      override async syncBriefVersion(): Promise<string> {
        this.syncCalls += 1;
        markStarted?.();
        await gate;
        return 'one-page';
      }
    }
    const notion = new SlowNotionProvider();
    const service = new NotionService(store, notion, config);
    await service.completeOAuth(identity, 'code', 'state');
    const first = service.sync(identity, project.id);
    await started;
    await expect(service.sync(identity, project.id)).resolves.toMatchObject({
      httpStatus: 202,
      status: 'syncing',
      idempotent: true,
    });
    release?.();
    await expect(first).resolves.toMatchObject({
      httpStatus: 200,
      pageId: 'one-page',
      status: 'synced',
      idempotent: false,
    });
    expect(notion.syncCalls).toBe(1);
  });

  it('refreshes a 401 during sync and reuses the claimed operation', async () => {
    const { store, project } = await storedProject();
    project.briefVersions[0]!.status = 'approved';
    project.workflowStatus = 'approved';
    project.notionParentId = 'parent';
    await store.saveProject(project);
    class SyncRefreshingProvider extends MockNotionProvider {
      syncTokens: string[] = [];
      override async exchangeCode() {
        return {
          access_token: 'stale-token',
          refresh_token: 'refresh-token',
          workspace_id: 'workspace',
        };
      }
      override async refreshToken() {
        return { access_token: 'fresh-token', workspace_id: 'workspace' };
      }
      override async syncBriefVersion(input: {
        existingPageId: string | null;
        title: string;
        projectId: string;
        version: number;
      }): Promise<string> {
        const accessToken = (input as typeof input & { accessToken: string }).accessToken;
        this.syncTokens.push(accessToken);
        if (accessToken === 'stale-token') throw new NotionApiError(401, 'NOTION_401');
        return 'refreshed-page';
      }
    }
    const notion = new SyncRefreshingProvider();
    const service = new NotionService(store, notion, config);
    await service.completeOAuth(identity, 'code', 'state');
    await expect(service.sync(identity, project.id)).resolves.toMatchObject({
      httpStatus: 200,
      pageId: 'refreshed-page',
    });
    expect(notion.syncTokens).toEqual(['stale-token', 'fresh-token']);
  });

  it('requires reconnection when an expired connection has no refresh token', async () => {
    class ExpiredProvider extends MockNotionProvider {
      override async exchangeCode() {
        return { access_token: 'expired', workspace_id: 'workspace', expires_in: -1 };
      }
    }
    const store = new MemoryProjectStore();
    const service = new NotionService(store, new ExpiredProvider(), config);
    await service.completeOAuth(identity, 'code', 'state');
    await expect(service.listPages(identity)).rejects.toMatchObject({
      status: 401,
      code: 'NOTION_RECONNECT_REQUIRED',
    });
  });

  it('clears a stale expiry when the refreshed Notion token has no expiry', async () => {
    class NonExpiringRefreshProvider extends MockNotionProvider {
      refreshes = 0;

      override async exchangeCode() {
        return {
          access_token: 'expired-token',
          refresh_token: 'refresh-token',
          workspace_id: 'workspace',
          expires_in: -1,
        };
      }

      override async refreshToken() {
        this.refreshes += 1;
        return {
          access_token: 'fresh-token',
          refresh_token: 'rotated-refresh-token',
          workspace_id: 'workspace',
        };
      }
    }

    const store = new MemoryProjectStore();
    const notion = new NonExpiringRefreshProvider();
    const service = new NotionService(store, notion, config);
    await service.completeOAuth(identity, 'code', 'state');

    await expect(service.listPages(identity)).resolves.toHaveLength(2);
    await expect(service.listPages(identity)).resolves.toHaveLength(2);

    expect(notion.refreshes).toBe(1);
    await expect(store.getNotionConnection('user-a')).resolves.toMatchObject({
      expiresAt: null,
    });
  });

  it('returns 202 for an active sync lease and records provider failures safely', async () => {
    const { store, project } = await storedProject();
    project.briefVersions[0]!.status = 'approved';
    project.workflowStatus = 'approved';
    project.notionParentId = 'parent';
    await store.saveProject(project);
    const connectionService = new NotionService(store, new MockNotionProvider(), config);
    await connectionService.completeOAuth(identity, 'code', 'state');
    await store.claimNotionSync({
      ownerId: 'user-a',
      projectId: project.id,
      briefVersion: 1,
      notionPageId: null,
      status: 'syncing',
      errorCode: null,
      operationId: crypto.randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      contentHash: 'different-hash-for-conflict-check',
      updatedAt: project.updatedAt,
    });
    await expect(connectionService.sync(identity, project.id)).rejects.toMatchObject({
      code: 'SYNC_CONTENT_CONFLICT',
    });

    const failedStore = new MemoryProjectStore();
    const failedProject = makeProject(true);
    failedProject.briefVersions[0]!.status = 'approved';
    failedProject.workflowStatus = 'approved';
    failedProject.notionParentId = 'parent';
    await failedStore.createProject(failedProject);
    const denied: NotionProvider = {
      ...new MockNotionProvider(),
      authorizationUrl: () => '/notion',
      verifyState: () => undefined,
      exchangeCode: () => Promise.resolve({ access_token: 'token', workspace_id: 'workspace' }),
      refreshToken: () => Promise.resolve({ access_token: 'token', workspace_id: 'workspace' }),
      listPages: () => Promise.resolve([]),
      syncBriefVersion: () => Promise.reject(new NotionApiError(403, 'NOTION_403')),
    };
    const failedService = new NotionService(failedStore, denied, config);
    await failedService.completeOAuth(identity, 'code', 'state');
    await expect(failedService.sync(identity, failedProject.id)).rejects.toMatchObject({
      status: 502,
      code: 'NOTION_SYNC_FAILED',
    });
    expect((await failedStore.getProject('user-a', failedProject.id))?.syncStatus).toBe('error');
  });

  it('accepts a validated denial and maps invalid OAuth state to a safe client error', async () => {
    const store = new MemoryProjectStore();
    const mock = new MockNotionProvider();
    const denied = new NotionService(store, mock, config);
    expect(() => denied.rejectOAuth(identity, 'state')).not.toThrow();
    class InvalidStateNotionProvider extends MockNotionProvider {
      override verifyState(): void {
        throw new Error('secret detail');
      }
    }
    const invalid = new NotionService(store, new InvalidStateNotionProvider(), config);
    await expect(invalid.completeOAuth(identity, 'code', 'bad-state')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_OAUTH_STATE',
    });
  });
});
