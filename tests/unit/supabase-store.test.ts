import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ProjectVersionConflictError } from '../../server/store/types.js';
import { SupabaseProjectStore, type SupabaseClientFactory } from '../../server/store/supabase.js';
import { makeProject } from '../ui/fixtures.js';

interface SupabaseResult {
  data?: unknown;
  error?: unknown;
}

function builder(result: SupabaseResult) {
  const chain: Record<string, unknown> & PromiseLike<SupabaseResult> = {
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ['select', 'eq', 'order', 'maybeSingle', 'insert', 'delete', 'upsert']) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

function fakeFactory(fromResults: SupabaseResult[], rpcResults: SupabaseResult[] = []) {
  const client = {
    from: vi.fn(() => builder(fromResults.shift() ?? { data: null, error: null })),
    rpc: vi.fn(async () => rpcResults.shift() ?? { data: null, error: null }),
  };
  const factory: SupabaseClientFactory = vi.fn(() => client as unknown as SupabaseClient);
  return { client, factory };
}

const token = 'test-clerk-jwt';

describe('SupabaseProjectStore adapter', () => {
  it('combines request cancellation with Supabase operation signals', async () => {
    const project = makeProject();
    const { factory } = fakeFactory([{ data: [{ document: project, revision: 1 }], error: null }]);
    const requestController = new AbortController();
    const store = new SupabaseProjectStore('https://db.example', 'publishable', factory);
    await store.listProjects('user-a', token, requestController.signal);
    const factoryCalls = (factory as ReturnType<typeof vi.fn>).mock.calls as unknown as Array<
      [string, string, { global: { fetch?: typeof fetch } }]
    >;
    const wrappedFetch = factoryCalls[0]?.[2].global.fetch;
    expect(wrappedFetch).toBeTypeOf('function');
    let combined: AbortSignal | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      combined = init?.signal ?? undefined;
      return new Response('{}', { status: 200 });
    });
    const operationController = new AbortController();
    await wrappedFetch!('https://db.example/rest/v1/projects', {
      signal: operationController.signal,
    });
    requestController.abort(new Error('request closed'));
    expect(combined?.aborted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  it('maps project CRUD and optimistic revisions', async () => {
    const project = makeProject();
    const { client, factory } = fakeFactory(
      [
        { data: [{ document: project, revision: 1 }], error: null },
        { data: { document: project, revision: 1 }, error: null },
        { error: null },
        { data: [{ id: project.id }], error: null },
      ],
      [{ data: 1, error: null }],
    );
    const store = new SupabaseProjectStore('https://db.example', 'publishable', factory);
    await expect(store.listProjects('user-a', token)).resolves.toEqual([project]);
    await expect(store.getProject('user-a', project.id, token)).resolves.toEqual(project);
    await expect(store.createProject(project, token)).resolves.toEqual(project);
    const saved = await store.saveProject(project, token);
    expect(saved.revision).toBe(2);
    expect(project.revision).toBe(2);
    await expect(store.deleteProject('user-a', project.id, token)).resolves.toBe(true);
    const rpcCalls = client.rpc.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
    expect(rpcCalls.find(([name]) => name === 'compare_and_save_project')?.[1]).toMatchObject({
      p_expected_revision: 1,
      p_document: { revision: 2 },
    });
  });

  it('maps interview claims and completion results', async () => {
    const project = makeProject();
    const clientAnswerId = crypto.randomUUID();
    const { factory } = fakeFactory(
      [],
      [
        {
          data: [
            {
              claim_state: 'duplicate',
              turn_status: 'processed',
              turn_result: project,
              turn_error_code: null,
            },
          ],
          error: null,
        },
        { data: true, error: null },
      ],
    );
    const store = new SupabaseProjectStore('https://db.example', 'publishable', factory);
    await expect(
      store.claimInterviewTurn(
        'user-a',
        project.id,
        clientAnswerId,
        { answer: 'safe payload' },
        false,
        token,
      ),
    ).resolves.toMatchObject({ state: 'duplicate', status: 'processed', result: project });
    await expect(
      store.completeInterviewTurn(
        'user-a',
        project.id,
        clientAnswerId,
        'processed',
        project,
        null,
        token,
      ),
    ).resolves.toBeUndefined();
  });

  it('maps encrypted Notion connections and sync operations', async () => {
    const project = makeProject();
    const connectionRow = {
      owner_id: 'user-a',
      access_token_encrypted: 'ciphertext',
      refresh_token_encrypted: 'refresh-ciphertext',
      workspace_id: 'workspace',
      workspace_name: 'Workspace',
      bot_id: 'bot',
      expires_at: null,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    };
    const operationId = crypto.randomUUID();
    const syncRow = {
      claim_state: 'claimed',
      owner_id: 'user-a',
      project_id: project.id,
      brief_version: 1,
      notion_page_id: null,
      sync_status: 'syncing',
      error_code: null,
      operation_id: operationId,
      lease_expires_at: project.updatedAt,
      content_hash: 'hash',
      updated_at: project.updatedAt,
    };
    const { factory } = fakeFactory(
      [{ data: connectionRow, error: null }, { error: null }, { error: null }],
      [
        { data: [syncRow], error: null },
        { data: true, error: null },
      ],
    );
    const store = new SupabaseProjectStore('https://db.example', 'publishable', factory);
    const connection = await store.getNotionConnection('user-a', token);
    expect(connection).toMatchObject({ ownerId: 'user-a', accessTokenEncrypted: 'ciphertext' });
    await expect(store.saveNotionConnection(connection!, token)).resolves.toBeUndefined();
    await expect(store.deleteNotionConnection('user-a', token)).resolves.toBeUndefined();
    const record = {
      ownerId: 'user-a',
      projectId: project.id,
      briefVersion: 1,
      notionPageId: null,
      status: 'syncing' as const,
      errorCode: null,
      operationId,
      leaseExpiresAt: project.updatedAt,
      contentHash: 'hash',
      updatedAt: project.updatedAt,
    };
    await expect(store.claimNotionSync(record, token)).resolves.toMatchObject({
      state: 'claimed',
      record,
    });
    await expect(store.completeNotionSync(record, token)).resolves.toBeUndefined();
  });

  it('fails closed for missing JWTs, provider errors, invalid claims, and stale revisions', async () => {
    const project = makeProject();
    const missingToken = new SupabaseProjectStore('https://db.example', 'publishable');
    await expect(missingToken.listProjects('user-a')).rejects.toThrow('SUPABASE_JWT_REQUIRED');

    const databaseError = new Error('database unavailable');
    const failing = new SupabaseProjectStore(
      'https://db.example',
      'publishable',
      fakeFactory([{ data: null, error: databaseError }]).factory,
    );
    await expect(failing.getProject('user-a', project.id, token)).rejects.toBe(databaseError);

    const stale = new SupabaseProjectStore(
      'https://db.example',
      'publishable',
      fakeFactory([], [{ data: 0, error: null }]).factory,
    );
    await expect(stale.saveProject(project, token)).rejects.toBeInstanceOf(
      ProjectVersionConflictError,
    );

    const invalidClaim = new SupabaseProjectStore(
      'https://db.example',
      'publishable',
      fakeFactory([], [{ data: [], error: null }]).factory,
    );
    await expect(
      invalidClaim.claimInterviewTurn('user-a', project.id, 'answer', {}, false, token),
    ).rejects.toThrow('TURN_CLAIM_FAILED');

    const invalidSync = new SupabaseProjectStore(
      'https://db.example',
      'publishable',
      fakeFactory(
        [],
        [
          {
            data: [
              {
                claim_state: 'invalid',
                owner_id: 'user-a',
                project_id: project.id,
                brief_version: 1,
              },
            ],
            error: null,
          },
        ],
      ).factory,
    );
    await expect(
      invalidSync.claimNotionSync(
        {
          ownerId: 'user-a',
          projectId: project.id,
          briefVersion: 1,
          notionPageId: null,
          status: 'syncing',
          errorCode: null,
          operationId: crypto.randomUUID(),
          leaseExpiresAt: null,
          contentHash: 'hash',
          updatedAt: project.updatedAt,
        },
        token,
      ),
    ).rejects.toThrow('NOTION_CLAIM_INVALID');
  });
});
