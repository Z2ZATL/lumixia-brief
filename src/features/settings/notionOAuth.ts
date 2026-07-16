export type NotionOAuthResult = 'connected' | 'cancelled' | 'failed';

interface NotionOAuthMessage {
  type: 'lumixia:notion-oauth-result';
  result: NotionOAuthResult;
}

const channelName = 'lumixia:notion-oauth';

export function openNotionAuthorizationTab(): Window | null {
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  return tab;
}

export function navigateNotionAuthorizationTab(tab: Window, authorizationUrl: string) {
  tab.location.replace(authorizationUrl);
}

export function publishNotionOAuthResult(result: NotionOAuthResult) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(channelName);
  channel.postMessage({ type: 'lumixia:notion-oauth-result', result } satisfies NotionOAuthMessage);
  channel.close();
}

export function subscribeToNotionOAuthResult(
  listener: (result: NotionOAuthResult) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const channel = new BroadcastChannel(channelName);
  const handleMessage = (event: MessageEvent<unknown>) => {
    if (isNotionOAuthMessage(event.data)) listener(event.data.result);
  };
  channel.addEventListener('message', handleMessage);
  return () => {
    channel.removeEventListener('message', handleMessage);
    channel.close();
  };
}

function isNotionOAuthMessage(value: unknown): value is NotionOAuthMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NotionOAuthMessage>;
  return (
    candidate.type === 'lumixia:notion-oauth-result' &&
    (candidate.result === 'connected' ||
      candidate.result === 'cancelled' ||
      candidate.result === 'failed')
  );
}
