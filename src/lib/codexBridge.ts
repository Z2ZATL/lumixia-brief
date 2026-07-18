import type { GeneratedBrief, InterviewAnalysis, Project } from '../../shared/contracts';

const bridgeOrigin = 'http://127.0.0.1:8790';
const tokenKey = 'lumixia-codex-bridge-token';
const pairMessageType = 'lumixia:codex-bridge';

export interface CodexBridgeStatus {
  ready: boolean;
  model: string;
}

export class CodexBridgeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CodexBridgeError';
  }
}

export function connectCodexBridge(timeoutMs = 15_000): Promise<CodexBridgeStatus> {
  const popup = window.open(
    `${bridgeOrigin}/pair?origin=${encodeURIComponent(window.location.origin)}`,
    'lumixia-codex-bridge',
    'popup,width=520,height=420',
  );
  if (!popup) return Promise.reject(new CodexBridgeError('BRIDGE_POPUP_BLOCKED'));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
    };
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== bridgeOrigin || event.source !== popup || !isPairMessage(event.data)) {
        return;
      }
      cleanup();
      sessionStorage.setItem(tokenKey, event.data.token);
      resolve({ ready: true, model: event.data.model });
    };
    const timer = window.setTimeout(() => {
      cleanup();
      popup.close();
      reject(new CodexBridgeError('BRIDGE_PAIR_TIMEOUT'));
    }, timeoutMs);
    window.addEventListener('message', receive);
  });
}

export async function codexBridgeStatus(signal?: AbortSignal): Promise<CodexBridgeStatus | null> {
  if (!sessionStorage.getItem(tokenKey)) return null;
  try {
    const result = await bridgeFetch<CodexBridgeStatus>('/health', {
      method: 'GET',
      ...(signal ? { signal } : {}),
    });
    return isStatus(result) ? result : null;
  } catch {
    clearCodexBridgeSession();
    return null;
  }
}

export async function analyzeWithCodexBridge(
  project: Project,
  clientAnswerId: string,
  answer: string,
  signal?: AbortSignal,
): Promise<InterviewAnalysis> {
  const response = await bridgeFetch<{ result: InterviewAnalysis }>('/v1/interview', {
    method: 'POST',
    body: JSON.stringify({ project, clientAnswerId, answer }),
    ...(signal ? { signal } : {}),
  });
  return response.result;
}

export async function generateWithCodexBridge(
  project: Project,
  signal?: AbortSignal,
): Promise<GeneratedBrief> {
  const response = await bridgeFetch<{ result: GeneratedBrief }>('/v1/brief', {
    method: 'POST',
    body: JSON.stringify({ project }),
    ...(signal ? { signal } : {}),
  });
  return response.result;
}

export function clearCodexBridgeSession(): void {
  sessionStorage.removeItem(tokenKey);
}

async function bridgeFetch<T>(path: string, init: RequestInit): Promise<T> {
  const token = sessionStorage.getItem(tokenKey);
  if (!token) throw new CodexBridgeError('BRIDGE_NOT_CONNECTED');
  let response: Response;
  try {
    response = await fetch(`${bridgeOrigin}${path}`, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new CodexBridgeError('BRIDGE_UNAVAILABLE');
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new CodexBridgeError(errorCode(body));
  return body as T;
}

function isPairMessage(value: unknown): value is { type: string; token: string; model: string } {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message['type'] === pairMessageType &&
    typeof message['token'] === 'string' &&
    message['token'].length >= 32 &&
    typeof message['model'] === 'string' &&
    message['model'].length > 0
  );
}

function isStatus(value: unknown): value is CodexBridgeStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  return status['ready'] === true && typeof status['model'] === 'string';
}

function errorCode(value: unknown): string {
  if (!value || typeof value !== 'object') return 'BRIDGE_OPERATION_FAILED';
  const error = (value as Record<string, unknown>)['error'];
  if (!error || typeof error !== 'object') return 'BRIDGE_OPERATION_FAILED';
  const code = (error as Record<string, unknown>)['code'];
  return typeof code === 'string' ? code : 'BRIDGE_OPERATION_FAILED';
}
