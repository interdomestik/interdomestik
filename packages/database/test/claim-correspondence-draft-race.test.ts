import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actor,
  importDomain,
  waitUntilBlocked,
  withDomainPools,
} from './claim-correspondence-domain.fixture';
import {
  homeActor,
  homeTenant,
  insertClaim,
  restricted,
  withRegisterDb,
  type Connection,
} from './claim-correspondence.fixture';

type Member = ReturnType<typeof actor>;
type DraftEdit = (
  input: Member & {
    claimId: string;
    requestHeaders: Headers;
    data: {
      category: 'vehicle';
      title: string;
      companyName: string;
      description: string;
      currency: 'EUR';
      files: [];
    };
  }
) => Promise<{ success: boolean; code?: string }>;

const barrierKey = 120104;

async function race(
  { admin, peer, role }: Connection,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>
) {
  const blocked = (holder: number) =>
    waitUntilBlocked(
      admin,
      async () => {
        const [row] = await admin<{ pid: number }[]>`
      select pid from pg_stat_activity
      where datname = current_database() and usename = ${role}
        and application_name = 'wp12_register_runtime'
        and ${holder} = any(pg_blocking_pids(pid))`;
        return row?.pid ?? 0;
      },
      holder
    );

  const pending: Promise<unknown>[] = [];
  const sql: string[] = [];
  function start(command: () => Promise<unknown>) {
    const work = command();
    pending.push(work);
    // Observe failures even if the barrier assertion fails before both commands finish.
    void work.catch(() => {});
  }
  try {
    await restricted(peer, async tx => {
      const [{ pid: holder }] = await tx<{ pid: number }[]>`
        select pg_backend_pid() as pid, pg_advisory_xact_lock(${barrierKey}::bigint)`;
      start(first);
      const firstPid = await blocked(holder);
      start(second);
      const secondPid = await blocked(firstPid);
      for (const pid of [firstPid, secondPid]) {
        const [{ query }] = await admin<{ query: string }[]>`
          select query from pg_stat_activity where pid = ${pid}`;
        sql.push(query);
      }
    });
    return { results: await Promise.all(pending), sql };
  } finally {
    await Promise.allSettled(pending);
  }
}

test('WP-12 draft edits and submissions race through both production commands', async t => {
  await withRegisterDb(
    t,
    async connections => {
      const { admin, runtime, role } = connections;
      await admin.unsafe(`
      grant insert on claim_stage_history to "${role}";
      grant select, insert on domain_events, domain_event_keys to "${role}";
      create function wp12_pause_claim_write() returns trigger language plpgsql as $$
      begin
        perform pg_advisory_xact_lock(${barrierKey}::bigint);
        return null;
      end;
      $$;
      create trigger wp12_pause_claim_write after update on claim
        for each row execute function wp12_pause_claim_write();
    `);
      await withDomainPools(admin, runtime, async () => {
        const [{ updateDraftClaimCore }, { transitionClaimStatus }] = await Promise.all([
          importDomain<{ updateDraftClaimCore: DraftEdit }>('/claims/draft'),
          // The public status command refuses drafts before it reaches the writer.
          import('../../domain-claims/src/claims/transition'),
        ]);
        const member = actor(homeActor, 'member', homeTenant, null);
        for (const submitFirst of [true, false]) {
          await t.test(
            submitFirst ? 'submission commits first' : 'draft edit commits first',
            async () => {
              const claim = await insertClaim(admin, { lifecycle: 'draft', category: 'property' });
              const edit = () =>
                updateDraftClaimCore({
                  ...member,
                  requestHeaders: new Headers(),
                  claimId: claim.id,
                  data: {
                    category: 'vehicle',
                    title: 'Edited draft title',
                    companyName: 'Example organisation',
                    description: 'A description long enough for the claim validator.',
                    currency: 'EUR',
                    files: [],
                  },
                });
              const submit = () =>
                transitionClaimStatus({
                  authority: member.authority,
                  actor: { id: homeActor, role: 'member' },
                  claimId: claim.id,
                  toStatus: 'submitted',
                });

              const { results, sql } = await race(
                connections,
                submitFirst ? submit : edit,
                submitFirst ? edit : submit
              );
              const [submitted, edited] = submitFirst ? results : [...results].reverse();
              const [submitSql, editSql] = submitFirst ? sql : [...sql].reverse();
              assert.deepEqual(submitted, {
                success: true,
                fromStatus: 'draft',
                status: 'submitted',
                lifecycleVersion: 1,
              });
              assert.deepEqual(
                edited,
                submitFirst
                  ? { success: false, error: 'Claim changed. Refresh and retry.', code: 'CONFLICT' }
                  : { success: true }
              );

              const [stored] = await admin`
            select case_lifecycle_state, recovery_lifecycle_state, lifecycle_version, category, title
            from claim where id = ${claim.id}`;
              assert.deepEqual(stored, {
                case_lifecycle_state: 'submitted',
                recovery_lifecycle_state: 'not_started',
                lifecycle_version: 1,
                category: submitFirst ? 'property' : 'vehicle',
                title: submitFirst ? 'Case fixture' : 'Edited draft title',
              });
              const stages = await admin`
            select from_status, to_status, changed_by_id from claim_stage_history
            where claim_id = ${claim.id}`;
              assert.deepEqual(
                [...stages],
                [{ from_status: 'draft', to_status: 'submitted', changed_by_id: homeActor }]
              );
              const events = await admin`
            select event_name, aggregate_version from domain_events
            where entity_id = ${claim.id} order by event_name`;
              assert.deepEqual(
                [...events],
                [
                  { event_name: 'case.lifecycle_changed', aggregate_version: 1 },
                  { event_name: 'claim.status_changed', aggregate_version: 1 },
                ]
              );

              // The intake trigger is a second line of defense. Inspect the blocked production
              // statements so the test also pins each command's compare-and-set independently.
              assert.match(
                submitSql,
                /where .*claim_category_open_for_intake\("claim"\."category"\)/
              );
              assert.match(editSql, /where .*"claim"\."case_lifecycle_state" = \$\d+/);
            }
          );
        }
      });
    },
    2
  );
});
