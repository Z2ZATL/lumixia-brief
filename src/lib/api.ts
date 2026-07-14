import type { Project } from '../../shared/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const localAuth = !import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(localAuth ? { 'x-test-user': 'local-demo-user', 'x-test-aal': 'aal2' } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as
    { error?: { code: string; message: string } } | T | null;
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Request failed.',
    );
  }
  return body as T;
}

export const projectApi = {
  list: () => api<{ projects: Project[] }>('/projects'),
  get: (id: string) => api<{ project: Project }>(`/projects/${id}`),
  create: (input: { title: string; initialPrompt: string; locale: 'en' | 'th' }) =>
    api<{ project: Project }>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  remove: (id: string) => api<void>(`/projects/${id}`, { method: 'DELETE' }),
  startInterview: (id: string) =>
    api<{ project: Project }>(`/projects/${id}/interview/start`, { method: 'POST' }),
  submitAnswer: (
    id: string,
    input: { clientAnswerId: string; question: string; dimension: string; answer: string },
  ) =>
    api<{ project: Project }>(`/projects/${id}/interview/answers`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  retryAnswer: (id: string, clientAnswerId: string) =>
    api<{ project: Project }>(`/projects/${id}/interview/answers/${clientAnswerId}/retry`, {
      method: 'POST',
    }),
  generateBrief: (id: string) =>
    api<{ project: Project }>(`/projects/${id}/briefs/generate`, { method: 'POST' }),
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
    api<{ project: Project; pageId: string }>(`/projects/${id}/notion/sync`, { method: 'POST' }),
};
