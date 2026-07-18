import { useEffect, useState } from 'react';
import type { Translator } from '../brief/meta';
import {
  clearCodexBridgeSession,
  codexBridgeStatus,
  connectCodexBridge,
  type CodexBridgeStatus,
} from '../../lib/codexBridge';
import { systemApi } from '../../lib/api';

export function useCodexBridge(t: Translator) {
  const [status, setStatus] = useState<CodexBridgeStatus | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      systemApi.capabilities(controller.signal),
      codexBridgeStatus(controller.signal),
    ])
      .then(([capabilities, bridge]) => {
        setSupported(capabilities.codexLocal.available);
        setStatus(bridge);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('codexBridgeUnavailable'));
      });
    return () => controller.abort();
  }, [t]);

  const connect = async () => {
    if (!supported) return;
    setBusy(true);
    setError('');
    try {
      await connectCodexBridge();
      const connected = await codexBridgeStatus();
      if (!connected) throw new Error('BRIDGE_UNAVAILABLE');
      setStatus(connected);
    } catch {
      clearCodexBridgeSession();
      setStatus(null);
      setError(t('codexBridgePairFailed'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    clearCodexBridgeSession();
    setStatus(null);
    setError('');
  };

  return { status, supported, busy, error, connect, disconnect };
}
