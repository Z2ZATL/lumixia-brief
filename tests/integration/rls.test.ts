import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const sql = postgres(
  process.env['SUPABASE_DB_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  { max: 1 },
);

describe('Supabase owner + MFA RLS', () => {
  const projectId = crypto.randomUUID();
  const operationProjectId = crypto.randomUUID();

  beforeAll(async () => {
    await sql`insert into public.projects (
      id, owner_id, title, workflow_status, sync_status, revision, document
    ) values (
      ${operationProjectId}, 'user-a', 'Operations', 'interviewing', 'not_synced', 1,
      ${sql.json({ id: operationProjectId, revision: 1 })}
    )`;
  });

  afterAll(async () => {
    await sql`delete from public.projects where id in (${projectId}, ${operationProjectId})`;
    await sql.end();
  });

  it('rejects AAL1 inserts', async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal1', role: 'authenticated' })}, true)`;
        await tx`insert into public.projects (id, owner_id, title, workflow_status, sync_status, document) values (${projectId}, 'user-a', 'Blocked', 'draft', 'not_synced', '{}'::jsonb)`;
      }),
    ).rejects.toThrow();
  });

  it('rejects an AMR-only claim so database MFA matches Express', async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal1', amr: ['totp'], role: 'authenticated' })}, true)`;
        await tx`insert into public.projects (id, owner_id, title, workflow_status, sync_status, document) values (${crypto.randomUUID()}, 'user-a', 'Blocked AMR', 'draft', 'not_synced', '{}'::jsonb)`;
      }),
    ).rejects.toThrow();
  });

  it('allows AAL2 owner access and hides the row from another user', async () => {
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', role: 'authenticated' })}, true)`;
      await tx`insert into public.projects (id, owner_id, title, workflow_status, sync_status, document) values (${projectId}, 'user-a', 'Allowed', 'draft', 'not_synced', '{}'::jsonb)`;
      const own = await tx`select id from public.projects where id = ${projectId}`;
      expect(own).toHaveLength(1);
    });

    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-b', aal: 'aal2', role: 'authenticated' })}, true)`;
      const other = await tx`select id from public.projects where id = ${projectId}`;
      expect(other).toHaveLength(0);
    });
  });

  it('atomically claims interview turns and rejects concurrent work', async () => {
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', role: 'authenticated' })}, true)`;
      const firstId = crypto.randomUUID();
      const secondId = crypto.randomUUID();
      const payload = { clientAnswerId: firstId, answer: 'first' };
      const claimed = await tx`select * from public.claim_interview_turn(
        'user-a', ${operationProjectId}, ${firstId}, ${tx.json(payload)}, false
      )`;
      expect(claimed[0]?.['claim_state']).toBe('claimed');
      const duplicate = await tx`select * from public.claim_interview_turn(
        'user-a', ${operationProjectId}, ${firstId}, ${tx.json(payload)}, false
      )`;
      expect(duplicate[0]?.['claim_state']).toBe('duplicate');
      const busy = await tx`select * from public.claim_interview_turn(
        'user-a', ${operationProjectId}, ${secondId}, ${tx.json({ answer: 'second' })}, false
      )`;
      expect(busy[0]?.['claim_state']).toBe('busy');
      const completed = await tx`select public.complete_interview_turn(
        'user-a', ${operationProjectId}, ${firstId}, 'processed',
        ${tx.json({ id: operationProjectId, revision: 2 })}, null
      ) as completed`;
      expect(completed[0]?.['completed']).toBe(true);
    });
  });

  it('recovers failed and stale interview leases without duplicating a turn', async () => {
    const failedId = crypto.randomUUID();
    const staleId = crypto.randomUUID();
    const failedPayload = { answer: 'retry this exact payload' };
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', role: 'authenticated' })}, true)`;
      await tx`select * from public.claim_interview_turn(
        'user-a', ${operationProjectId}, ${failedId}, ${tx.json(failedPayload)}, false
      )`;
      await tx`select public.complete_interview_turn(
        'user-a', ${operationProjectId}, ${failedId}, 'failed',
        ${tx.json({ id: operationProjectId })}, 'MODEL_UNAVAILABLE'
      )`;
      const duplicate = await tx`select * from public.claim_interview_turn(
        'user-a', ${operationProjectId}, ${failedId}, ${tx.json(failedPayload)}, false
      )`;
      expect(duplicate[0]?.['claim_state']).toBe('duplicate');
      expect(duplicate[0]?.['turn_status']).toBe('failed');
      const retry = await tx`select * from public.claim_interview_turn(
        'user-a', ${operationProjectId}, ${failedId}, ${tx.json(failedPayload)}, true
      )`;
      expect(retry[0]?.['claim_state']).toBe('claimed');
      await tx`select public.complete_interview_turn(
        'user-a', ${operationProjectId}, ${failedId}, 'processed',
        ${tx.json({ id: operationProjectId })}, null
      )`;
      await tx`select * from public.claim_interview_turn(
        'user-a', ${operationProjectId}, ${staleId}, ${tx.json({ answer: 'stale' })}, false
      )`;
    });
    await sql`update public.answer_claims set lease_expires_at = now() - interval '1 second' where client_answer_id = ${staleId}`;
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', role: 'authenticated' })}, true)`;
      const reclaimed = await tx`select * from public.claim_interview_turn(
        'user-a', ${operationProjectId}, ${staleId}, ${tx.json({ answer: 'stale' })}, false
      )`;
      expect(reclaimed[0]?.['claim_state']).toBe('claimed');
    });
  });

  it('compares project revisions and leases a single Notion sync operation', async () => {
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', role: 'authenticated' })}, true)`;
      const saved = await tx`select public.compare_and_save_project(
        'user-a', ${operationProjectId}, 1, ${tx.json({ id: operationProjectId, revision: 2 })},
        'Operations v2', 'interviewing', 'not_synced', now()
      ) as affected`;
      expect(saved[0]?.['affected']).toBe(1);
      const stale = await tx`select public.compare_and_save_project(
        'user-a', ${operationProjectId}, 1, ${tx.json({ id: operationProjectId, revision: 2 })},
        'Stale', 'interviewing', 'not_synced', now()
      ) as affected`;
      expect(stale[0]?.['affected']).toBe(0);

      const operationId = crypto.randomUUID();
      const claimed = await tx`select * from public.claim_notion_sync(
        'user-a', ${operationProjectId}, 1, ${operationId}, 'content-hash', null,
        now() + interval '60 seconds'
      )`;
      expect(claimed[0]?.['claim_state']).toBe('claimed');
      const concurrent = await tx`select * from public.claim_notion_sync(
        'user-a', ${operationProjectId}, 1, ${crypto.randomUUID()}, 'content-hash', null,
        now() + interval '60 seconds'
      )`;
      expect(concurrent[0]?.['claim_state']).toBe('syncing');
      const completed = await tx`select public.complete_notion_sync(
        'user-a', ${operationProjectId}, 1, ${operationId}, 'page-id', 'synced', null
      ) as completed`;
      expect(completed[0]?.['completed']).toBe(true);
    });
  });

  it('reclaims a stale Notion lease with a new operation ID', async () => {
    const version = 2;
    const firstOperation = crypto.randomUUID();
    const nextOperation = crypto.randomUUID();
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', role: 'authenticated' })}, true)`;
      await tx`select * from public.claim_notion_sync(
        'user-a', ${operationProjectId}, ${version}, ${firstOperation}, 'same-content', null,
        now() + interval '60 seconds'
      )`;
    });
    await sql`update public.notion_syncs set lease_expires_at = now() - interval '1 second' where project_id = ${operationProjectId} and brief_version = ${version}`;
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', role: 'authenticated' })}, true)`;
      const reclaimed = await tx`select * from public.claim_notion_sync(
        'user-a', ${operationProjectId}, ${version}, ${nextOperation}, 'same-content', null,
        now() + interval '60 seconds'
      )`;
      expect(reclaimed[0]?.['claim_state']).toBe('claimed');
      expect(reclaimed[0]?.['operation_id']).toBe(nextOperation);
    });
  });

  it('cascades interview and sync records when the owner deletes a project', async () => {
    const cascadeProjectId = crypto.randomUUID();
    const answerId = crypto.randomUUID();
    await sql`insert into public.projects (
      id, owner_id, title, workflow_status, sync_status, revision, document
    ) values (
      ${cascadeProjectId}, 'user-a', 'Cascade project', 'interviewing', 'not_synced', 1,
      ${sql.json({ id: cascadeProjectId, revision: 1 })}
    )`;
    await sql`insert into public.answer_claims (
      project_id, owner_id, client_answer_id, status, payload
    ) values (${cascadeProjectId}, 'user-a', ${answerId}, 'processed', '{}'::jsonb)`;
    await sql`insert into public.notion_syncs (
      owner_id, project_id, brief_version, status, content_hash
    ) values ('user-a', ${cascadeProjectId}, 1, 'error', 'hash')`;
    await sql`delete from public.projects where id = ${cascadeProjectId}`;
    const claims =
      await sql`select id from public.answer_claims where project_id = ${cascadeProjectId}`;
    const syncs =
      await sql`select id from public.notion_syncs where project_id = ${cascadeProjectId}`;
    expect(claims).toHaveLength(0);
    expect(syncs).toHaveLength(0);
  });

  it('enforces the distributed rate limit inside Postgres', async () => {
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 'user-a', aal: 'aal2', role: 'authenticated' })}, true)`;
      const first =
        await tx`select public.consume_rate_limit('user-a', 'test-bucket', 2, 60) as allowed`;
      const second =
        await tx`select public.consume_rate_limit('user-a', 'test-bucket', 2, 60) as allowed`;
      const third =
        await tx`select public.consume_rate_limit('user-a', 'test-bucket', 2, 60) as allowed`;
      expect([first[0]?.['allowed'], second[0]?.['allowed'], third[0]?.['allowed']]).toEqual([
        true,
        true,
        false,
      ]);
    });
  });

  it('allows the anonymous readiness probe without exposing project data', async () => {
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role anon');
      const result = await tx`select public.readiness_check() as ready`;
      expect(result[0]?.['ready']).toBe(true);
    });

    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role anon');
        await tx`select id from public.projects limit 1`;
      }),
    ).rejects.toThrow();
  });
});
