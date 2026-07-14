import { useEffect, useState } from 'react';
import type { Translator } from '../brief/meta';
import { api } from '../../lib/api';

interface NotionStatus {
  connected: boolean;
  workspaceName: string | null;
}

export function useNotionConnection(t: Translator) {
  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<NotionStatus>('/notion/status')
      .then((nextStatus) => {
        if (active) setStatus(nextStatus);
      })
      .catch((caught: Error) => {
        if (active) setError(caught.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api<{ authorizationUrl: string }>('/notion/connect');
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('connectFailed'));
      setBusy(false);
    }
  }
  async function disconnect() {
    if (busy) return;
    setBusy(true);
    try {
      await api('/notion/disconnect', { method: 'DELETE' });
      setStatus({ connected: false, workspaceName: null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('disconnectFailed'));
    } finally {
      setBusy(false);
    }
  }
  return { status, error, busy, connect, disconnect };
}
