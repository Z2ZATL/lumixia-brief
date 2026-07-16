import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { BriefSections } from '../../shared/contracts.js';

const NOTION_VERSION = '2022-06-28';

interface OAuthStatePayload {
  ownerId: string;
  nonce: string;
  expiresAt: number;
}

export interface NotionTokenResponse {
  access_token: string;
  refresh_token?: string;
  workspace_id: string;
  workspace_name?: string | null;
  bot_id?: string;
  expires_in?: number;
}

export interface NotionPageOption {
  id: string;
  title: string;
}

export interface NotionProvider {
  authorizationUrl(ownerId: string): string;
  verifyState(state: string, ownerId: string): void;
  exchangeCode(code: string, signal?: AbortSignal): Promise<NotionTokenResponse>;
  refreshToken(refreshToken: string, signal?: AbortSignal): Promise<NotionTokenResponse>;
  listPages(accessToken: string, signal?: AbortSignal): Promise<NotionPageOption[]>;
  syncBriefVersion(input: {
    accessToken: string;
    parentId: string;
    existingPageId: string | null;
    projectId: string;
    title: string;
    sections: BriefSections;
    version: number;
    contentHash: string;
    signal?: AbortSignal;
  }): Promise<string>;
}

export class LiveNotionProvider implements NotionProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly stateSecret: string,
  ) {}

  authorizationUrl(ownerId: string): string {
    const state = this.signState({
      ownerId,
      nonce: randomBytes(16).toString('base64url'),
      expiresAt: Date.now() + 10 * 60_000,
    });
    const url = new URL('https://api.notion.com/v1/oauth/authorize');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('owner', 'user');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  }

  verifyState(state: string, ownerId: string): void {
    const [payloadPart, signaturePart] = state.split('.');
    if (!payloadPart || !signaturePart) throw new Error('INVALID_OAUTH_STATE');
    const expected = this.signature(payloadPart);
    const actual = Buffer.from(signaturePart, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error('INVALID_OAUTH_STATE');
    }
    const payload = JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8'),
    ) as OAuthStatePayload;
    if (payload.ownerId !== ownerId || payload.expiresAt < Date.now()) {
      throw new Error('INVALID_OAUTH_STATE');
    }
  }

  exchangeCode(code: string, signal?: AbortSignal): Promise<NotionTokenResponse> {
    return this.tokenRequest(
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      },
      signal,
    );
  }

  refreshToken(refreshToken: string, signal?: AbortSignal): Promise<NotionTokenResponse> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, signal);
  }

  async listPages(accessToken: string, signal?: AbortSignal): Promise<NotionPageOption[]> {
    const pages: NotionPageOption[] = [];
    let cursor: string | null = null;
    do {
      const response = (await this.request(
        '/search',
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            filter: { property: 'object', value: 'page' },
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
            page_size: 50,
            ...(cursor ? { start_cursor: cursor } : {}),
          }),
        },
        signal,
      )) as {
        results: Array<{
          id: string;
          properties?: Record<string, { type?: string; title?: Array<{ plain_text?: string }> }>;
        }>;
        has_more?: boolean;
        next_cursor?: string | null;
      };
      pages.push(...response.results.map(toPageOption));
      cursor = response.has_more && pages.length < 200 ? (response.next_cursor ?? null) : null;
    } while (cursor);
    return pages;
  }

  async syncBriefVersion(input: {
    accessToken: string;
    parentId: string;
    existingPageId: string | null;
    projectId: string;
    title: string;
    sections: BriefSections;
    version: number;
    contentHash: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const projectMarker = `LB-${input.projectId}`;
    const versionMarker = `${projectMarker}:v${input.version}:${input.contentHash}`;
    const existingPageId =
      input.existingPageId ??
      (await this.findPageByMarker(input.accessToken, projectMarker, input.signal));
    const pageId =
      existingPageId ??
      (await this.createPage(input.accessToken, input.parentId, projectMarker, input.signal));
    await this.updatePageTitle(
      input.accessToken,
      pageId,
      `${input.title} — v${input.version} [${projectMarker}]`,
      input.signal,
    );
    if (!(await this.hasVersionMarker(input.accessToken, pageId, versionMarker, input.signal))) {
      await this.appendBlocks(
        input.accessToken,
        pageId,
        versionBlocks(input.version, versionMarker, input.sections),
        input.signal,
      );
    }
    return pageId;
  }

  private async findPageByMarker(
    token: string,
    marker: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const result = (await this.request(
      '/search',
      token,
      {
        method: 'POST',
        body: JSON.stringify({ query: marker, page_size: 20 }),
      },
      signal,
    )) as { results?: Array<{ id?: string; properties?: unknown }> };
    const page = result.results?.find((item) => JSON.stringify(item.properties).includes(marker));
    return page?.id ?? null;
  }

  private async createPage(
    token: string,
    parentId: string,
    marker: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const created = (await this.request(
      '/pages',
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          parent: { type: 'page_id', page_id: parentId },
          properties: { title: { type: 'title', title: richTextArray(marker) } },
        }),
      },
      signal,
    )) as { id: string };
    return created.id;
  }

  private updatePageTitle(
    token: string,
    pageId: string,
    title: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.request(
      `/pages/${pageId}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({
          properties: { title: { type: 'title', title: richTextArray(title) } },
        }),
      },
      signal,
    );
  }

  private async hasVersionMarker(
    token: string,
    pageId: string,
    marker: string,
    signal?: AbortSignal,
  ) {
    let cursor: string | null = null;
    do {
      const suffix = cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : '';
      const response = (await this.request(
        `/blocks/${pageId}/children?page_size=100${suffix}`,
        token,
        { method: 'GET' },
        signal,
      )) as { results?: unknown[]; has_more?: boolean; next_cursor?: string | null };
      if (response.results?.some((block) => JSON.stringify(block).includes(marker))) return true;
      cursor = response.has_more ? (response.next_cursor ?? null) : null;
    } while (cursor);
    return false;
  }

  private async appendBlocks(
    token: string,
    pageId: string,
    blocks: NotionBlock[],
    signal?: AbortSignal,
  ) {
    for (let index = 0; index < blocks.length; index += 100) {
      await this.request(
        `/blocks/${pageId}/children`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ children: blocks.slice(index, index + 100) }),
        },
        signal,
      );
    }
  }

  private signState(payload: OAuthStatePayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.signature(encoded).toString('base64url')}`;
  }

  private signature(payload: string): Buffer {
    return createHmac('sha256', this.stateSecret).update(payload).digest();
  }

  private tokenRequest(
    body: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<NotionTokenResponse> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    return this.request(
      '/oauth/token',
      '',
      {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}` },
        body: JSON.stringify(body),
      },
      signal,
    ) as Promise<NotionTokenResponse>;
  }

  private async request(
    path: string,
    token: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) throw abortError(signal);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.requestOnce(path, token, init, signal);
      } catch (error) {
        if (signal?.aborted) throw abortError(signal);
        lastError = error;
        const ambiguousCreate = path === '/pages' && init.method === 'POST';
        if (!shouldRetry(error, attempt, ambiguousCreate)) throw error;
        await delay(retryDelay(error, attempt), signal);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('NOTION_REQUEST_FAILED');
  }

  private async requestOnce(
    path: string,
    token: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      signal: combinedSignal(signal, AbortSignal.timeout(15_000)),
      headers: {
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (response.ok) return response.status === 204 ? null : response.json();
    const retryAfter = Number(response.headers.get('retry-after') ?? 0);
    throw new NotionApiError(
      response.status,
      `NOTION_${response.status}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
    );
  }
}

export class NotionApiError extends Error {
  constructor(
    readonly status: number,
    code: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(code);
    this.name = 'NotionApiError';
  }
}

export class MockNotionProvider implements NotionProvider {
  private readonly pages = new Map<string, string>();

  authorizationUrl(ownerId: string): string {
    void ownerId;
    return '/notion/callback?code=mock-code&state=mock-state';
  }
  verifyState(): void {}
  async exchangeCode(): Promise<NotionTokenResponse> {
    return {
      access_token: 'mock-token',
      refresh_token: 'mock-refresh',
      workspace_id: 'mock-workspace',
    };
  }
  async refreshToken(): Promise<NotionTokenResponse> {
    return {
      access_token: 'mock-token-2',
      refresh_token: 'mock-refresh-2',
      workspace_id: 'mock-workspace',
    };
  }
  async listPages(): Promise<NotionPageOption[]> {
    return [
      { id: 'mock-founder-hub', title: 'Founder workspace' },
      { id: 'mock-product-hub', title: 'Product briefs' },
    ];
  }
  async syncBriefVersion(input: {
    existingPageId: string | null;
    title: string;
    projectId: string;
    version: number;
  }): Promise<string> {
    const existing = [...this.pages.entries()].find(([, marker]) =>
      marker.includes(input.projectId),
    );
    const id = input.existingPageId ?? existing?.[0] ?? `notion-${randomBytes(8).toString('hex')}`;
    this.pages.set(id, `${input.title}:v${input.version}:${input.projectId}`);
    return id;
  }
}

type NotionBlock = Record<string, unknown>;

function toPageOption(page: {
  id: string;
  properties?: Record<string, { type?: string; title?: Array<{ plain_text?: string }> }>;
}): NotionPageOption {
  const titleProperty = Object.values(page.properties ?? {}).find(
    (property) => property.type === 'title',
  );
  return {
    id: page.id,
    title: titleProperty?.title?.map((item) => item.plain_text ?? '').join('') || 'Untitled page',
  };
}

function richText(content: string) {
  return { type: 'text', text: { content } };
}

function richTextArray(content: string) {
  return splitText(content).map(richText);
}

function splitText(content: string): string[] {
  if (!content) return [''];
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += 2000) {
    chunks.push(content.slice(index, index + 2000));
  }
  return chunks;
}

function versionBlocks(version: number, marker: string, sections: BriefSections): NotionBlock[] {
  return [
    {
      object: 'block',
      type: 'divider',
      divider: {},
    },
    {
      object: 'block',
      type: 'heading_1',
      heading_1: { rich_text: richTextArray(`Version ${version}`) },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: richTextArray(marker) },
    },
    ...notionBlocks(sections),
  ];
}

function notionBlocks(sections: BriefSections): NotionBlock[] {
  const entries: Array<[string, string | string[]]> = [
    ['Summary', sections.summary],
    ['Problem statement', sections.problemStatement],
    ['Goals', sections.goals],
    ['Success criteria', sections.successCriteria],
    ['Audience', sections.audience],
    ['Deliverables', sections.deliverables],
    ['Must-have', sections.mustHave],
    ['Nice-to-have', sections.niceToHave],
    ['Non-goals', sections.nonGoals],
    ['Constraints', sections.constraints],
    ['Timeline', sections.timeline],
    ['Risks', sections.risks],
    ['Assumptions', sections.assumptions],
    ['Open questions', sections.openQuestions],
    ['Decisions requiring approval', sections.decisionsRequiringApproval],
    ['Next steps', sections.nextSteps],
  ];
  return entries.flatMap(([heading, value]) => {
    const values = Array.isArray(value) ? value : [value];
    return [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [richText(heading)] },
      },
      ...values.filter(Boolean).flatMap((text) =>
        splitText(text).map((chunk) => ({
          object: 'block',
          type: Array.isArray(value) ? 'bulleted_list_item' : 'paragraph',
          [Array.isArray(value) ? 'bulleted_list_item' : 'paragraph']: {
            rich_text: [richText(chunk)],
          },
        })),
      ),
    ];
  });
}

function combinedSignal(...signals: Array<AbortSignal | undefined>) {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (!active.length) return new AbortController().signal;
  return active.length === 1 ? active[0]! : AbortSignal.any(active);
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError(signal));
      },
      { once: true },
    );
  });
}

function shouldRetry(error: unknown, attempt: number, ambiguousCreate: boolean): boolean {
  if (attempt >= 2) return false;
  if (error instanceof NotionApiError) return error.status === 429 || error.status >= 500;
  return !ambiguousCreate;
}

function retryDelay(error: unknown, attempt: number): number {
  return error instanceof NotionApiError && error.retryAfterMs
    ? error.retryAfterMs
    : 250 * 2 ** attempt;
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('REQUEST_ABORTED');
}
