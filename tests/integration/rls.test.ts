import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const enabled = process.env.RUN_SUPABASE_INTEGRATION === 'true';
const suite = enabled ? describe : describe.skip;
const sql = enabled
  ? postgres(
      process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      {
        max: 1,
      },
    )
  : null;

suite('Supabase owner + MFA RLS', () => {
  const projectId = crypto.randomUUID();

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from public.projects where id = ${projectId}`;
    await sql.end();
  });

  it('rejects AAL1 inserts', async () => {
    await expect(
      sql!.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal1', fva: [1, -1], role: 'authenticated' })}, true)`;
        await tx`insert into public.projects (id, owner_id, title, workflow_status, sync_status, document) values (${projectId}, 'user-a', 'Blocked', 'draft', 'not_synced', '{}'::jsonb)`;
      }),
    ).rejects.toThrow();
  });

  it('allows AAL2 owner access and hides the row from another user', async () => {
    await sql!.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', fva: [1, 0], role: 'authenticated' })}, true)`;
      await tx`insert into public.projects (id, owner_id, title, workflow_status, sync_status, document) values (${projectId}, 'user-a', 'Allowed', 'draft', 'not_synced', '{}'::jsonb)`;
      const own = await tx`select id from public.projects where id = ${projectId}`;
      expect(own).toHaveLength(1);
    });

    await sql!.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-b', aal: 'aal2', fva: [1, 0], role: 'authenticated' })}, true)`;
      const other = await tx`select id from public.projects where id = ${projectId}`;
      expect(other).toHaveLength(0);
    });
  });
});
