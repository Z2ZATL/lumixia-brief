import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthBoundary } from '../auth';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

type NotionPayload =
  | { result: 'success'; state: string; code: string }
  | { result: 'denied'; state: string; error: 'access_denied' }
  | null;

interface NotionOperation {
  controller: AbortController;
  promise: Promise<{ connected: boolean; cancelled: boolean }>;
  subscribers: number;
}

export function NotionCallback() {
  const [payload] = useState<NotionPayload>(() => readPayload(window.location.search));
  useLayoutEffect(() => window.history.replaceState({}, '', '/notion/callback'), []);
  return (
    <AuthBoundary>
      <NotionCompletion payload={payload} />
    </AuthBoundary>
  );
}

function NotionCompletion({ payload }: { payload: NotionPayload }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const operation = useRef<NotionOperation | null>(null);
  const [message, setMessage] = useState(t('notionCallbackWorking'));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!payload) {
      void navigate('/settings?notion=cancelled', { replace: true });
      return;
    }
    operation.current ??= createNotionOperation(payload);
    const activeOperation = operation.current;
    activeOperation.subscribers += 1;
    let active = true;
    void activeOperation.promise
      .then((result) => {
        if (!active) return;
        setMessage(result.cancelled ? t('notionCancelledReturn') : t('notionConnectedReturn'));
        void navigate(`/settings?notion=${result.cancelled ? 'cancelled' : 'connected'}`, {
          replace: true,
        });
      })
      .catch(() => {
        if (active && !activeOperation.controller.signal.aborted) setError(t('connectFailed'));
      });
    return () => {
      active = false;
      activeOperation.subscribers -= 1;
      queueMicrotask(() => {
        if (activeOperation.subscribers === 0) activeOperation.controller.abort();
      });
    };
  }, [navigate, payload, t]);
  return (
    <main className="callback-stage">
      {error ? (
        <div className="alert error" role="alert">
          {error}
        </div>
      ) : (
        <>
          <div className="spinner" role="status" aria-label={message} />
          <p>{message}</p>
        </>
      )}
    </main>
  );
}

function createNotionOperation(payload: Exclude<NotionPayload, null>): NotionOperation {
  const controller = new AbortController();
  return {
    controller,
    promise: api<{ connected: boolean; cancelled: boolean }>('/notion/callback', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
    }),
    subscribers: 0,
  };
}

function readPayload(search: string): NotionPayload {
  const params = new URLSearchParams(search);
  const state = params.get('state');
  const code = params.get('code');
  if (!state) return null;
  if (params.get('error') === 'access_denied')
    return { result: 'denied', state, error: 'access_denied' };
  return code ? { result: 'success', state, code } : null;
}
