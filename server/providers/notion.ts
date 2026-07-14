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
  exchangeCode(code: string): Promise<NotionTokenResponse>;
  refreshToken(refreshToken: string): Promise<NotionTokenResponse>;
  listPages(accessToken: string): Promise<NotionPageOption[]>;
  createOrUpdatePage(input: {
    accessToken: string;
    parentId: string;
    existingPageId: string | null;
    title: string;
    sections: BriefSections;
    version: number;
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

  exchangeCode(code: string): Promise<NotionTokenResponse> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
  }

  refreshToken(refreshToken: string): Promise<NotionTokenResponse> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async listPages(accessToken: string): Promise<NotionPageOption[]> {
    const response = (await this.request('/search', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 50,
      }),
    })) as {
      results: Array<{
        id: string;
        properties?: Record<string, { type?: string; title?: Array<{ plain_text?: string }> }>;
      }>;
    };
    return response.results.map((page) => {
      const titleProperty = Object.values(page.properties ?? {}).find(
        (property) => property.type === 'title',
      );
      return {
        id: page.id,
        title:
          titleProperty?.title?.map((item) => item.plain_text ?? '').join('') || 'Untitled page',
      };
    });
  }

  async createOrUpdatePage(input: {
    accessToken: string;
    parentId: string;
    existingPageId: string | null;
    title: string;
    sections: BriefSections;
    version: number;
  }): Promise<string> {
    if (input.existingPageId) {
      await this.request(`/pages/${input.existingPageId}`, input.accessToken, {
        method: 'PATCH',
        body: JSON.stringify({
          properties: {
            title: { type: 'title', title: [richText(`${input.title} — v${input.version}`)] },
          },
        }),
      });
      return input.existingPageId;
    }

    const response = (await this.request('/pages', input.accessToken, {
      method: 'POST',
      body: JSON.stringify({
        parent: { type: 'page_id', page_id: input.parentId },
        properties: {
          title: { type: 'title', title: [richText(`${input.title} — v${input.version}`)] },
        },
        children: notionBlocks(input.sections),
      }),
    })) as { id: string };
    return response.id;
  }

  private signState(payload: OAuthStatePayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.signature(encoded).toString('base64url')}`;
  }

  private signature(payload: string): Buffer {
    return createHmac('sha256', this.stateSecret).update(payload).digest();
  }

  private tokenRequest(body: Record<string, string>): Promise<NotionTokenResponse> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    return this.request('/oauth/token', '', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
      body: JSON.stringify(body),
    }) as Promise<NotionTokenResponse>;
  }

  private async request(path: string, token: string, init: RequestInit): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`https://api.notion.com/v1${path}`, {
        ...init,
        signal: AbortSignal.timeout(15_000),
        headers: {
          'Content-Type': 'application/json',
          'Notion-Version': NOTION_VERSION,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
      if (response.ok) return response.json();
      const error = new NotionApiError(response.status, `NOTION_${response.status}`);
      lastError = error;
      if (attempt === 2 || (response.status !== 429 && response.status < 500)) throw error;
      const retryAfter = Number(response.headers.get('retry-after') ?? 0);
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt),
      );
    }
    throw lastError;
  }
}

export class NotionApiError extends Error {
  constructor(
    readonly status: number,
    code: string,
  ) {
    super(code);
    this.name = 'NotionApiError';
  }
}

export class MockNotionProvider implements NotionProvider {
  private readonly pages = new Map<string, string>();

  authorizationUrl(ownerId: string): string {
    void ownerId;
    return '/api/notion/callback?code=mock-code&state=mock-state';
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
  async createOrUpdatePage(input: {
    existingPageId: string | null;
    title: string;
  }): Promise<string> {
    const id = input.existingPageId ?? `notion-${randomBytes(8).toString('hex')}`;
    this.pages.set(id, input.title);
    return id;
  }
}

function richText(content: string) {
  return { type: 'text', text: { content: content.slice(0, 2000) } };
}

function notionBlocks(sections: BriefSections) {
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
      ...values.filter(Boolean).map((text) => ({
        object: 'block',
        type: Array.isArray(value) ? 'bulleted_list_item' : 'paragraph',
        [Array.isArray(value) ? 'bulleted_list_item' : 'paragraph']: {
          rich_text: [richText(text)],
        },
      })),
    ];
  });
}
