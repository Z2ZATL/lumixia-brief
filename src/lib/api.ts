import type {
  CapabilityStatus,
  CodexLocalBriefInput,
  CodexLocalInterviewInput,
  DimensionKey,
  Project,
} from '../../shared/contracts';
import { expireBrowserSession, getAccessToken, refreshAccessToken } from '../auth/client';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, await getAccessToken(), false);
}

async function request<T>(
  path: string,
  init: RequestInit,
  accessToken: string | null,
  refreshed: boolean,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'omit',
    headers,
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as ApiResponseBody<T>;
  if (!response.ok) return handleFailure<T>(path, init, response.status, body, refreshed);
  return body as T;
}

type ApiResponseBody<T> = { error?: { code: string; message: string } } | T | null;

async function handleFailure<T>(
  path: string,
  init: RequestInit,
  status: number,
  body: ApiResponseBody<T>,
  refreshed: boolean,
): Promise<T> {
  const error = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
  if (!refreshed && error?.code === 'AUTH_SESSION_EXPIRED') {
    return refreshAndRetry<T>(path, init);
  }
  throw new ApiError(status, error?.code ?? 'REQUEST_FAILED', error?.message ?? 'Request failed.');
}

async function refreshAndRetry<T>(path: string, init: RequestInit): Promise<T> {
  let token: string;
  try {
    token = await refreshAccessToken();
  } catch {
    await expireBrowserSession();
    throw new ApiError(401, 'AUTH_REQUIRED', 'Your session expired. Sign in again.');
  }
  return request<T>(path, init, token, true);
}

export const projectApi = {
  list: (signal?: AbortSignal) =>
    api<{ projects: Project[] }>('/projects', signal ? { signal } : {}),
  get: (id: string, signal?: AbortSignal) =>
    api<{ project: Project }>(`/projects/${id}`, signal ? { signal } : {}),
  create: (input: { title: string; initialPrompt: string; locale: 'en' | 'th' }) =>
    api<{ project: Project }>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  remove: (id: string) => api<void>(`/projects/${id}`, { method: 'DELETE' }),
  startInterview: (id: string) =>
    api<{ project: Project }>(`/projects/${id}/interview/start`, { method: 'POST' }),
  submitAnswer: (
    id: string,
    input: {
      clientAnswerId: string;
      question: string;
      dimension: DimensionKey;
      answer: string;
    },
  ) =>
    api<{
      project: Project;
      status: 'processed' | 'pending' | 'failed';
      idempotent: boolean;
    }>(`/projects/${id}/interview/answers`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  submitCodexAnswer: (id: string, input: CodexLocalInterviewInput) =>
    api<{
      project: Project;
      status: 'processed' | 'pending' | 'failed';
      idempotent: boolean;
    }>(`/projects/${id}/interview/codex-local`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  retryAnswer: (id: string, clientAnswerId: string) =>
    api<{
      project: Project;
      status: 'processed' | 'pending' | 'failed';
      idempotent: boolean;
    }>(`/projects/${id}/interview/answers/${clientAnswerId}/retry`, { method: 'POST' }),
  generateBrief: (id: string) =>
    api<{ project: Project }>(`/projects/${id}/briefs/generate`, { method: 'POST' }),
  generateCodexBrief: (id: string, input: CodexLocalBriefInput) =>
    api<{ project: Project }>(`/projects/${id}/briefs/codex-local`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  editBrief: (id: string, input: unknown) =>
    api<{ project: Project }>(`/projects/${id}/briefs/current`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  approveBrief: (id: string) =>
    api<{ project: Project }>(`/projects/${id}/briefs/current/approve`, { method: 'POST' }),
  requestChanges: (id: string, input: unknown) =>
    api<{ project: Project }>(`/projects/${id}/briefs/current/request-changes`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  selectNotionParent: (id: string, parentId: string) =>
    api<{ project: Project }>(`/projects/${id}/notion/parent`, {
      method: 'POST',
      body: JSON.stringify({ parentId }),
    }),
  syncNotion: (id: string) =>
    api<{
      project: Project;
      pageId: string | null;
      status: 'syncing' | 'synced';
      idempotent: boolean;
    }>(`/projects/${id}/notion/sync`, { method: 'POST' }),
};

export const systemApi = {
  capabilities: (signal?: AbortSignal) =>
    api<CapabilityStatus>('/capabilities', signal ? { signal } : {}),
};
