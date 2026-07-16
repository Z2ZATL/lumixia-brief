import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Translator } from '../brief/meta';
import { api } from '../../lib/api';
import {
  navigateNotionAuthorizationTab,
  openNotionAuthorizationTab,
  subscribeToNotionOAuthResult,
} from './notionOAuth';

interface NotionStatus {
  connected: boolean;
  workspaceName: string | null;
}

type LoadNotionStatus = (signal?: AbortSignal) => Promise<NotionStatus>;

interface NotionLifecycleOptions {
  busy: boolean;
  t: Translator;
  loadStatus: LoadNotionStatus;
  handleStatusError: (caught: unknown) => void;
  setStatus: Dispatch<SetStateAction<NotionStatus | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
}

export function useNotionConnection(t: Translator) {
  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const loadStatus = useCallback(
    (signal?: AbortSignal) => api<NotionStatus>('/notion/status', signal ? { signal } : undefined),
    [],
  );
  const handleStatusError = useCallback(
    (caught: unknown) => {
      setError(caught instanceof Error ? caught.message : t('connectFailed'));
    },
    [t],
  );
  useNotionLifecycle({
    busy,
    t,
    loadStatus,
    handleStatusError,
    setStatus,
    setError,
    setBusy,
  });
  async function connect() {
    if (busy) return;
    const authorizationTab = openNotionAuthorizationTab();
    if (!authorizationTab) {
      setError(t('notionPopupBlocked'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ authorizationUrl: string }>('/notion/connect');
      navigateNotionAuthorizationTab(authorizationTab, result.authorizationUrl);
    } catch (caught) {
      authorizationTab.close();
      setError(caught instanceof Error ? caught.message : t('connectFailed'));
      setBusy(false);
    }
  }
  async function disconnect() {
    if (busy) return;
    setBusy(true);
    try {
      await api<{ disconnected: true }>('/notion/disconnect', { method: 'DELETE' });
      setStatus({ connected: false, workspaceName: null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('disconnectFailed'));
    } finally {
      setBusy(false);
    }
  }
  return { status, error, busy, connect, disconnect };
}

function useNotionLifecycle(options: NotionLifecycleOptions) {
  useInitialNotionStatus(options);
  useNotionOAuthResult(options);
  useNotionFocusRefresh(options);
}

function useInitialNotionStatus(options: NotionLifecycleOptions) {
  const { loadStatus, setError, setStatus } = options;
  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal)
      .then(setStatus)
      .catch((caught: Error) => {
        if (!controller.signal.aborted) setError(caught.message);
      });
    return () => controller.abort();
  }, [loadStatus, setError, setStatus]);
}

function useNotionOAuthResult(options: NotionLifecycleOptions) {
  const { handleStatusError, loadStatus, setBusy, setError, setStatus, t } = options;
  useEffect(() => {
    const controller = new AbortController();
    const unsubscribe = subscribeToNotionOAuthResult((result) => {
      if (controller.signal.aborted) return;
      setBusy(false);
      if (result === 'failed') {
        setError(t('connectFailed'));
        return;
      }
      setError('');
      if (result === 'connected')
        void loadStatus(controller.signal)
          .then(setStatus)
          .catch((caught: unknown) => {
            if (!controller.signal.aborted) handleStatusError(caught);
          });
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [handleStatusError, loadStatus, setBusy, setError, setStatus, t]);
}

function useNotionFocusRefresh(options: NotionLifecycleOptions) {
  const { busy, handleStatusError, loadStatus, setBusy, setStatus } = options;
  useEffect(() => {
    let activeRequest: AbortController | null = null;
    const refreshAfterOAuth = () => {
      if (!busy) return;
      activeRequest?.abort();
      activeRequest = new AbortController();
      const { signal } = activeRequest;
      void loadStatus(signal)
        .then(setStatus)
        .catch((caught: unknown) => {
          if (!signal.aborted) handleStatusError(caught);
        })
        .finally(() => {
          if (!signal.aborted) setBusy(false);
        });
    };
    window.addEventListener('focus', refreshAfterOAuth);
    return () => {
      activeRequest?.abort();
      window.removeEventListener('focus', refreshAfterOAuth);
    };
  }, [busy, handleStatusError, loadStatus, setBusy, setStatus]);
}
