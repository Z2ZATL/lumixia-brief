import { afterEach, describe, expect, it, vi } from 'vitest';

const bridgeOrigin = 'http://127.0.0.1:8790';

describe('Codex popup relay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps inference inside the loopback popup and never fetches loopback from HTTPS', async () => {
    vi.resetModules();
    const postMessage = vi.fn();
    const close = vi.fn();
    const popup = { closed: false, close, postMessage } as unknown as Window;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const bridge = await import('../../src/lib/codexBridge');

    const connecting = bridge.connectCodexBridge();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: bridgeOrigin,
        source: popup,
        data: { type: 'lumixia:codex-bridge:ready', model: 'gpt-5.6-sol' },
      }),
    );
    await expect(connecting).resolves.toEqual({ ready: true, model: 'gpt-5.6-sol' });

    const statusPromise = bridge.codexBridgeStatus();
    expect(postMessage).toHaveBeenCalledTimes(1);
    const request = postMessage.mock.calls[0]?.[0] as { id: string; action: string; type: string };
    expect(request).toMatchObject({
      type: 'lumixia:codex-bridge:request',
      action: 'health',
    });
    expect(postMessage.mock.calls[0]?.[1]).toBe(bridgeOrigin);
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: bridgeOrigin,
        source: popup,
        data: {
          type: 'lumixia:codex-bridge:response',
          id: request.id,
          ok: true,
          body: { ready: true, model: 'gpt-5.6-sol' },
        },
      }),
    );
    await expect(statusPromise).resolves.toEqual({ ready: true, model: 'gpt-5.6-sol' });
    expect(fetch).not.toHaveBeenCalled();

    bridge.clearCodexBridgeSession();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
