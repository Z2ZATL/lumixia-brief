import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const authMode =
  (import.meta.env['VITE_AUTH_MODE'] as 'local-demo' | 'supabase' | undefined) ?? 'local-demo';
export const isLocalDemo = authMode === 'local-demo';

let browserClient: SupabaseClient | undefined;
let refreshPromise: Promise<string> | undefined;
const returnPathKey = 'lumixia-auth-return-path';
const authStorageKey = 'lumixia-auth';
export const authExpiredEvent = 'lumixia:auth-expired';

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string | undefined;
  if (!url || !key) throw new Error('Supabase authentication is not configured.');
  browserClient = createClient(url, key, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: authStorageKey,
    },
  });
  return browserClient;
}

export async function getAccessToken(): Promise<string | null> {
  if (isLocalDemo) return null;
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw new Error('Could not restore the secure session.');
  return data.session?.access_token ?? null;
}

export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshSession().finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

async function refreshSession(): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient().auth.refreshSession();
  if (error || !data.session) throw new Error('Your session expired. Sign in again.');
  return data.session.access_token;
}

export async function expireBrowserSession(): Promise<void> {
  rememberReturnPath(`${window.location.pathname}${window.location.search}`);
  try {
    await getSupabaseBrowserClient().auth.signOut({ scope: 'local' });
  } catch {
    // Local cleanup below remains authoritative when the provider is unavailable.
  } finally {
    localStorage.removeItem(authStorageKey);
    window.dispatchEvent(new Event(authExpiredEvent));
  }
}

export function clearAuthCache(): void {
  localStorage.removeItem(authStorageKey);
  sessionStorage.removeItem(returnPathKey);
}

export function rememberReturnPath(path: string): void {
  sessionStorage.setItem(returnPathKey, safeReturnPath(path));
}

export function consumeReturnPath(): string {
  const path = sessionStorage.getItem(returnPathKey) ?? '/projects';
  sessionStorage.removeItem(returnPathKey);
  return safeReturnPath(path);
}

function safeReturnPath(path: string): string {
  if (/^\/(projects(?:\/.*)?|settings|security)$/.test(path)) return path;
  try {
    const url = new URL(path, 'https://lumixia.invalid');
    const authorizationId = url.searchParams.get('authorization_id');
    const exactQuery = url.searchParams.size === 1;
    if (
      url.pathname === '/oauth/consent' &&
      exactQuery &&
      authorizationId &&
      /^[a-zA-Z0-9_-]{8,200}$/.test(authorizationId)
    ) {
      return `${url.pathname}?authorization_id=${encodeURIComponent(authorizationId)}`;
    }
  } catch {
    return '/projects';
  }
  return '/projects';
}
