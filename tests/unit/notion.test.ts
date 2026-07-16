import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBriefSections } from '../../shared/contracts.js';
import {
  LiveNotionProvider,
  MockNotionProvider,
  type NotionProvider,
} from '../../server/providers/notion.js';

const provider = () =>
  new LiveNotionProvider('client', 'secret', 'https://app.example/callback', 's'.repeat(32));

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function textContents(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(textContents);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = typeof record['content'] === 'string' ? [record['content']] : [];
  return [...own, ...Object.values(record).flatMap(textContents)];
}

function requestUrl(input: string | URL | Request): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}

function requestBody(init?: RequestInit): string {
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body.');
  return init.body;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Notion OAuth and page discovery', () => {
  it('signs a short-lived owner-bound OAuth state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const live = provider();
    const url = new URL(live.authorizationUrl('owner-a'));
    const state = url.searchParams.get('state');
    expect(url.origin + url.pathname).toBe('https://api.notion.com/v1/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/callback');
    expect(state).toBeTruthy();
    expect(() => live.verifyState(state!, 'owner-a')).not.toThrow();
    expect(() => live.verifyState(state!, 'owner-b')).toThrow('INVALID_OAUTH_STATE');
    const [payloadPart, signaturePart] = state!.split('.');
    expect(payloadPart).toBeTruthy();
    expect(signaturePart).toBeTruthy();
    const tamperedSignature = `${signaturePart!.startsWith('A') ? 'B' : 'A'}${signaturePart!.slice(1)}`;
    expect(() => live.verifyState(`${payloadPart}.${tamperedSignature}`, 'owner-a')).toThrow(
      'INVALID_OAUTH_STATE',
    );
    expect(() => live.verifyState('malformed', 'owner-a')).toThrow('INVALID_OAUTH_STATE');
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 10 * 60_000 + 1);
    expect(() => live.verifyState(state!, 'owner-a')).toThrow('INVALID_OAUTH_STATE');
  });

  it('uses Basic authentication for code exchange and refresh-token rotation', async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: requestUrl(input), ...(init ? { init } : {}) });
        return jsonResponse({
          access_token: 'access',
          refresh_token: 'rotated-refresh',
          workspace_id: 'workspace',
        });
      }),
    );
    const live = provider();
    await live.exchangeCode('one-time-code');
    await live.refreshToken('previous-refresh');
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url.pathname).toBe('/v1/oauth/token');
    expect(new Headers(requests[0]!.init?.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('client:secret').toString('base64')}`,
    );
    expect(JSON.parse(requestBody(requests[0]!.init))).toEqual({
      grant_type: 'authorization_code',
      code: 'one-time-code',
      redirect_uri: 'https://app.example/callback',
    });
    expect(JSON.parse(requestBody(requests[1]!.init))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'previous-refresh',
    });
  });

  it('paginates parent pages, normalizes their titles, and stops at the last cursor', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(requestBody(init)) as Record<string, unknown>;
        requestBodies.push(body);
        if (!body['start_cursor']) {
          return jsonResponse({
            results: [
              {
                id: 'page-1',
                properties: { Name: { type: 'title', title: [{ plain_text: 'Roadmap' }] } },
              },
            ],
            has_more: true,
            next_cursor: 'cursor-2',
          });
        }
        return jsonResponse({ results: [{ id: 'page-2', properties: {} }], has_more: false });
      }),
    );
    await expect(provider().listPages('access-token')).resolves.toEqual([
      { id: 'page-1', title: 'Roadmap' },
      { id: 'page-2', title: 'Untitled page' },
    ]);
    expect(requestBodies[1]).toMatchObject({ start_cursor: 'cursor-2', page_size: 50 });
  });

  it('propagates request cancellation without waiting for retry backoff', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled by request'));
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return jsonResponse({ results: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider().listPages('token', controller.signal)).rejects.toThrow(
      'cancelled by request',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the mock integration idempotent per project', async () => {
    const mock: NotionProvider = new MockNotionProvider();
    expect(mock.authorizationUrl('owner')).toContain('mock-code');
    expect(() => mock.verifyState('state', 'owner')).not.toThrow();
    await expect(mock.exchangeCode('code')).resolves.toMatchObject({ access_token: 'mock-token' });
    await expect(mock.refreshToken('refresh')).resolves.toMatchObject({
      access_token: 'mock-token-2',
    });
    await expect(mock.listPages('token')).resolves.toHaveLength(2);
    const first = await mock.syncBriefVersion({
      accessToken: 'token',
      parentId: 'parent',
      existingPageId: null,
      projectId: 'project',
      title: 'Brief',
      sections: emptyBriefSections,
      version: 1,
      contentHash: 'hash-1',
    });
    await expect(
      mock.syncBriefVersion({
        accessToken: 'token',
        parentId: 'parent',
        existingPageId: null,
        projectId: 'project',
        title: 'Brief revised',
        sections: emptyBriefSections,
        version: 2,
        contentHash: 'hash-2',
      }),
    ).resolves.toBe(first);
  });
});

describe('Notion brief synchronization', () => {
  it('preserves long text and appends blocks in batches of at most 100', async () => {
    const appendBodies: unknown[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';
      if (url.pathname.endsWith('/search')) return jsonResponse({ results: [] });
      if (url.pathname.endsWith('/pages') && method === 'POST') {
        return jsonResponse({ id: 'notion-page-1' });
      }
      if (url.pathname.endsWith('/pages/notion-page-1')) return jsonResponse({});
      if (url.pathname.endsWith('/blocks/notion-page-1/children') && method === 'GET') {
        return jsonResponse({ results: [], has_more: false });
      }
      if (url.pathname.endsWith('/blocks/notion-page-1/children') && method === 'PATCH') {
        appendBodies.push(JSON.parse(requestBody(init)) as unknown);
        return jsonResponse({});
      }
      throw new Error(`Unexpected Notion request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const longSummary = 'a'.repeat(4500);
    const sections = {
      ...structuredClone(emptyBriefSections),
      summary: longSummary,
      risks: Array.from({ length: 110 }, (_, index) => `Risk ${index + 1}`),
    };
    const pageId = await provider().syncBriefVersion({
      accessToken: 'token',
      parentId: 'parent',
      existingPageId: null,
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Long brief',
      sections,
      version: 1,
      contentHash: 'hash-1',
    });
    expect(pageId).toBe('notion-page-1');
    expect(appendBodies.length).toBeGreaterThan(1);
    for (const body of appendBodies) {
      const children = (body as { children: unknown[] }).children;
      expect(children.length).toBeLessThanOrEqual(100);
    }
    expect(textContents(appendBodies).join('')).toContain(longSummary);
  });

  it('finds the deterministic marker after an ambiguous create timeout', async () => {
    let created = false;
    let createCalls = 0;
    const marker = 'LB-11111111-1111-4111-8111-111111111111';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = init?.method ?? 'GET';
        if (url.pathname.endsWith('/search')) {
          return jsonResponse({
            results: created
              ? [{ id: 'recovered-page', properties: { title: [{ plain_text: marker }] } }]
              : [],
          });
        }
        if (url.pathname.endsWith('/pages') && method === 'POST') {
          createCalls += 1;
          created = true;
          throw new TypeError('timeout after create');
        }
        if (url.pathname.endsWith('/pages/recovered-page')) return jsonResponse({});
        if (url.pathname.endsWith('/blocks/recovered-page/children') && method === 'GET') {
          return jsonResponse({ results: [], has_more: false });
        }
        if (url.pathname.endsWith('/blocks/recovered-page/children') && method === 'PATCH') {
          return jsonResponse({});
        }
        throw new Error(`Unexpected request ${method} ${url.pathname}`);
      }),
    );
    const input = {
      accessToken: 'token',
      parentId: 'parent',
      existingPageId: null,
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Recovered brief',
      sections: emptyBriefSections,
      version: 1,
      contentHash: 'hash-1',
    };
    await expect(provider().syncBriefVersion(input)).rejects.toThrow('timeout after create');
    await expect(provider().syncBriefVersion(input)).resolves.toBe('recovered-page');
    expect(createCalls).toBe(1);
  });

  it('updates the existing page title and appends each brief version once', async () => {
    const appended: unknown[] = [];
    const titles: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = init?.method ?? 'GET';
        if (url.pathname.endsWith('/pages/existing-page') && method === 'PATCH') {
          titles.push(textContents(JSON.parse(requestBody(init)) as unknown).join(''));
          return jsonResponse({});
        }
        if (url.pathname.endsWith('/blocks/existing-page/children') && method === 'GET') {
          return jsonResponse({ results: appended, has_more: false });
        }
        if (url.pathname.endsWith('/blocks/existing-page/children') && method === 'PATCH') {
          const body = JSON.parse(requestBody(init)) as { children: unknown[] };
          appended.push(...body.children);
          return jsonResponse({});
        }
        throw new Error(`Unexpected request ${method} ${url.pathname}`);
      }),
    );
    const baseInput = {
      accessToken: 'token',
      parentId: 'parent',
      existingPageId: 'existing-page',
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Founder brief',
      sections: { ...structuredClone(emptyBriefSections), summary: 'Version one content' },
      version: 1,
      contentHash: 'hash-1',
    };
    await provider().syncBriefVersion(baseInput);
    const afterFirst = appended.length;
    await provider().syncBriefVersion(baseInput);
    expect(appended).toHaveLength(afterFirst);
    await provider().syncBriefVersion({
      ...baseInput,
      title: 'Founder brief revised',
      sections: { ...baseInput.sections, summary: 'Version two content' },
      version: 2,
      contentHash: 'hash-2',
    });
    expect(titles.at(-1)).toContain('Founder brief revised — v2');
    expect(textContents(appended).join('')).toContain('Version one content');
    expect(textContents(appended).join('')).toContain('Version two content');
    expect(appended.length).toBeGreaterThan(afterFirst);
  });

  it('retries 429 and 5xx but does not retry a 403', async () => {
    const responses = [
      jsonResponse({}, 429, { 'retry-after': '0' }),
      jsonResponse({}, 500),
      jsonResponse({ results: [] }),
    ];
    const retryingFetch = vi.fn(async () => responses.shift()!);
    vi.stubGlobal('fetch', retryingFetch);
    await expect(provider().listPages('token')).resolves.toEqual([]);
    expect(retryingFetch).toHaveBeenCalledTimes(3);

    const deniedFetch = vi.fn(async () => jsonResponse({}, 403));
    vi.stubGlobal('fetch', deniedFetch);
    await expect(provider().listPages('token')).rejects.toMatchObject({ status: 403 });
    expect(deniedFetch).toHaveBeenCalledTimes(1);
  });
});
