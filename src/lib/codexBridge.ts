import type { GeneratedBrief, InterviewAnalysis, Project } from '../../shared/contracts';

const bridgeOrigin = 'http://127.0.0.1:8790';
const pairReadyType = 'lumixia:codex-bridge:ready';
const relayRequestType = 'lumixia:codex-bridge:request';
const relayCancelType = 'lumixia:codex-bridge:cancel';
const relayResponseType = 'lumixia:codex-bridge:response';
const operationTimeoutMs = 95_000;

export interface CodexBridgeStatus {
  ready: boolean;
  model: string;
}

type RelayAction = 'brief' | 'health' | 'interview';

interface RelayConnection {
  popup: Window;
  status: CodexBridgeStatus;
}

interface PendingRelayRequest {
  cleanup: () => void;
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
}

let relay: RelayConnection | null = null;
let relayListenerInstalled = false;
const pendingRequests = new Map<string, PendingRelayRequest>();

export class CodexBridgeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CodexBridgeError';
  }
}

export function connectCodexBridge(timeoutMs = 15_000): Promise<CodexBridgeStatus> {
  clearCodexBridgeSession();
  const popup = window.open(
    `${bridgeOrigin}/pair?origin=${encodeURIComponent(window.location.origin)}`,
    'lumixia-codex-bridge',
    'popup,width=520,height=420',
  );
  if (!popup) return Promise.reject(new CodexBridgeError('BRIDGE_POPUP_BLOCKED'));
  installRelayListener();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
    };
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== bridgeOrigin || event.source !== popup || !isPairReady(event.data)) {
        return;
      }
      cleanup();
      const status = { ready: true, model: event.data.model } as const;
      relay = { popup, status };
      resolve(status);
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
  if (!relay || relay.popup.closed) {
    clearCodexBridgeSession();
    return null;
  }
  try {
    const result = await relayRequest<CodexBridgeStatus>('health', undefined, signal, 5_000);
    if (!isStatus(result)) throw new CodexBridgeError('BRIDGE_INVALID_RESPONSE');
    relay.status = result;
    return result;
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
  const response = await relayRequest<{ result: InterviewAnalysis }>(
    'interview',
    { project, clientAnswerId, answer },
    signal,
  );
  return response.result;
}

export async function generateWithCodexBridge(
  project: Project,
  signal?: AbortSignal,
): Promise<GeneratedBrief> {
  const response = await relayRequest<{ result: GeneratedBrief }>('brief', { project }, signal);
  return response.result;
}

export function clearCodexBridgeSession(): void {
  const activeRelay = relay;
  relay = null;
  for (const request of pendingRequests.values()) {
    request.cleanup();
    request.reject(new CodexBridgeError('BRIDGE_DISCONNECTED'));
  }
  pendingRequests.clear();
  if (activeRelay && !activeRelay.popup.closed) activeRelay.popup.close();
}

function installRelayListener(): void {
  if (relayListenerInstalled) return;
  window.addEventListener('message', receiveRelayResponse);
  relayListenerInstalled = true;
}

function receiveRelayResponse(event: MessageEvent<unknown>): void {
  if (
    event.origin !== bridgeOrigin ||
    !relay ||
    event.source !== relay.popup ||
    !isRelayResponse(event.data)
  ) {
    return;
  }
  const pending = pendingRequests.get(event.data.id);
  if (!pending) return;
  pending.cleanup();
  pendingRequests.delete(event.data.id);
  if (event.data.ok) pending.resolve(event.data.body);
  else pending.reject(new CodexBridgeError(event.data.code));
}

function relayRequest<T>(
  action: RelayAction,
  payload: unknown,
  signal?: AbortSignal,
  timeoutMs = operationTimeoutMs,
): Promise<T> {
  const activeRelay = relay;
  if (!activeRelay || activeRelay.popup.closed) {
    clearCodexBridgeSession();
    return Promise.reject(new CodexBridgeError('BRIDGE_NOT_CONNECTED'));
  }
  if (signal?.aborted) return Promise.reject(new CodexBridgeError('BRIDGE_CANCELLED'));
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    };
    const fail = (error: Error) => {
      cleanup();
      pendingRequests.delete(id);
      reject(error);
    };
    const cancel = () => {
      activeRelay.popup.postMessage({ type: relayCancelType, id }, bridgeOrigin);
      fail(new CodexBridgeError('BRIDGE_CANCELLED'));
    };
    const timer = window.setTimeout(
      () => fail(new CodexBridgeError('BRIDGE_OPERATION_TIMEOUT')),
      timeoutMs,
    );
    pendingRequests.set(id, {
      cleanup,
      reject,
      resolve: (value) => resolve(value as T),
    });
    signal?.addEventListener('abort', cancel, { once: true });
    activeRelay.popup.postMessage({ type: relayRequestType, id, action, payload }, bridgeOrigin);
  });
}

function isPairReady(value: unknown): value is { type: string; model: string } {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message['type'] === pairReadyType &&
    typeof message['model'] === 'string' &&
    message['model'].length > 0
  );
}

function isRelayResponse(value: unknown): value is
  | { type: string; id: string; ok: true; body: unknown }
  | {
      type: string;
      id: string;
      ok: false;
      code: string;
    } {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (message['type'] !== relayResponseType || typeof message['id'] !== 'string') return false;
  if (message['ok'] === true) return 'body' in message;
  return message['ok'] === false && typeof message['code'] === 'string';
}

function isStatus(value: unknown): value is CodexBridgeStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  return status['ready'] === true && typeof status['model'] === 'string';
}
