import { createHmac, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = required('SUPABASE_TEST_URL');
const publishableKey = required('SUPABASE_TEST_PUBLISHABLE_KEY');
const serviceRoleKey = required('SUPABASE_TEST_SERVICE_ROLE_KEY');
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

describe('native Supabase Auth and AAL2 RLS', () => {
  it('denies AAL1, accepts verified TOTP, and isolates a second AAL2 user', async () => {
    const service = createClient(url, serviceRoleKey, clientOptions);
    const userIds: string[] = [];
    const projectId = randomUUID();
    try {
      const first = await createAal2Candidate(service);
      userIds.push(first.userId);
      const blocked = await first.client
        .from('projects')
        .insert(projectRow(projectId, first.userId));
      expect(blocked.error).not.toBeNull();

      await verifyTotp(first.client);
      const inserted = await first.client
        .from('projects')
        .insert(projectRow(projectId, first.userId));
      expect(inserted.error).toBeNull();
      const own = await first.client.from('projects').select('id').eq('id', projectId);
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(1);

      const second = await createAal2Candidate(service);
      userIds.push(second.userId);
      await verifyTotp(second.client);
      const hidden = await second.client.from('projects').select('id').eq('id', projectId);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toHaveLength(0);
    } finally {
      await service.from('projects').delete().eq('id', projectId);
      for (const userId of userIds) await service.auth.admin.deleteUser(userId);
    }
  });
});

async function createAal2Candidate(service: SupabaseClient) {
  const password = `Aa1-${randomUUID()}`;
  const email = `${randomUUID()}${String.fromCharCode(64)}example.invalid`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Synthetic Auth user creation failed.');
  const client = createClient(url, publishableKey, clientOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error('Synthetic Auth sign-in failed.');
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  expect(assurance.data?.currentLevel).toBe('aal1');
  return { client, userId: created.data.user.id };
}

async function verifyTotp(client: SupabaseClient): Promise<void> {
  const enrolled = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Integration factor',
  });
  if (enrolled.error) throw new Error('Synthetic TOTP enrollment failed.');
  const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
  if (challenge.error) throw new Error('Synthetic TOTP challenge failed.');
  const verified = await client.auth.mfa.verify({
    factorId: enrolled.data.id,
    challengeId: challenge.data.id,
    code: totp(enrolled.data.totp.secret),
  });
  if (verified.error) throw new Error('Synthetic TOTP verification failed.');
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  expect(assurance.data?.currentLevel).toBe('aal2');
}

function projectRow(id: string, ownerId: string) {
  return {
    id,
    owner_id: ownerId,
    title: 'Synthetic authentication contract',
    workflow_status: 'draft',
    sync_status: 'not_synced',
    document: { id, synthetic: true },
  };
}

function totp(secret: string): string {
  const key = decodeBase32(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1)! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, '0');
}

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.toUpperCase().replaceAll('=', '')) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid synthetic TOTP secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing integration-test configuration: ${name}`);
  return value;
}
