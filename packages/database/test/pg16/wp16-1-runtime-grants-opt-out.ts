import assert from 'node:assert/strict';
import type postgres from 'postgres';
import { optOutTokenHash } from '../../../domain-membership-billing/src/sponsors/roster-crypto';
import { withDisposableClient } from '../../src/disposable-client';
import { sponsorRuntimeRole } from '../../src/release-sponsor-checkpoint';
import { insert, MID, row, uid, type Scope } from '../sponsor-seed.test-support';
import type { ScratchClient } from './scratch-database';
import { proveSponsorJourneys } from './wp16-1-runtime-grants-journeys';

type Query = { connection: number; text: string; parameters: readonly unknown[] };

function observeQueries(sql: ScratchClient): Query[] {
  const seen: Query[] = [];
  sql.options.debug = (connection, text, parameters) => {
    // Keep synthetic SQL evidence in memory. Never print query parameters or URLs.
    seen.push({ connection, text, parameters: [...parameters] });
  };
  return seen;
}

function targetSnapshot(sql: ScratchClient, tenant: string) {
  return Promise.all([
    sql`select id, revoked_at, opted_out_at from sponsor_roster_entries where tenant_id = ${tenant} order by id`,
    sql`select id, roster_entry_id, state, kind from sponsor_mail_outbox where tenant_id = ${tenant} order by id`,
  ]);
}

export async function proveSponsorOptOut(
  owner: ScratchClient,
  database: string,
  a: Scope,
  b: Scope,
  token: string
) {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${database}`;
  await withDisposableClient(
    url.toString(),
    { applicationName: 'wp16_opt_out_admin' },
    async admin => {
      await withDisposableClient(
        url.toString(),
        { applicationName: 'wp16_opt_out_runtime' },
        async runtime => {
          await owner`grant insert on public.audit_log to ${owner(sponsorRuntimeRole)}`;
          await runtime`set statement_timeout = '8s'`;
          await runtime`set role ${runtime(sponsorRuntimeRole)}`;

          // db.ts already supports supplying distinct test clients by caching them on globalThis.
          // This test file runs in its own Node test process, before the application modules load.
          const clients = globalThis as typeof globalThis & {
            queryClientAdmin?: postgres.Sql;
            queryClientRls?: postgres.Sql;
          };
          assert.equal(clients.queryClientAdmin, undefined);
          assert.equal(clients.queryClientRls, undefined);
          const previousRole = process.env.DB_RLS_ROLE;
          const previousRls = process.env.REQUIRE_RLS_INTEGRATION;
          clients.queryClientAdmin = admin;
          clients.queryClientRls = runtime;
          process.env.DB_RLS_ROLE = sponsorRuntimeRole;
          process.env.REQUIRE_RLS_INTEGRATION = '1';
          try {
            const { optOutByToken } =
              await import('../../../domain-membership-billing/src/sponsors/opt-out');
            await proveSponsorJourneys(owner, a);
            await admin`select current_user`;
            const hash = optOutTokenHash(token);
            const [posture] = await runtime`select current_user as role,
          nullif(current_setting('app.current_access_tenant_id', true), '') as tenant`;
            assert.deepEqual(posture, { role: sponsorRuntimeRole, tenant: null });
            const visible = await runtime`select id from sponsor_roster_entries
          where optout_token_hash = ${hash}`;
            assert.equal(visible.length, 0);
            const otherBefore = await targetSnapshot(owner, b.tenant);

            // Observe the actual write transaction in PostgreSQL, independently of the query trace.
            await owner.unsafe(`
          create function public.wp16_observe_opt_out() returns trigger language plpgsql as $body$
          begin
            if current_user <> 'interdomestik_runtime_rls'
              or current_setting('app.current_access_tenant_id', true) is distinct from new.tenant_id
              or current_setting('app.current_tenant_id', true) is distinct from new.tenant_id then
              raise exception 'Unexpected opt-out write authority';
            end if;
            return new;
          end;
          $body$;
          create trigger wp16_observe_opt_out_update before update of opted_out_at, revoked_at on public.sponsor_roster_entries
            for each row execute function public.wp16_observe_opt_out();
          create trigger wp16_observe_opt_out_insert before insert on public.sponsor_mail_outbox
            for each row execute function public.wp16_observe_opt_out();
        `);
            const adminQueries = observeQueries(admin);
            const runtimeQueries = observeQueries(runtime);
            assert.deepEqual(await optOutByToken(token, new Date(MID)), { ok: true, revoked: 1 });
            assert.equal(adminQueries.length, 1);
            assert.match(
              adminQueries[0].text,
              /^select "tenant_id", "id" from "sponsor_roster_entries" where "sponsor_roster_entries"\."optout_token_hash" = \$1 limit \$2$/iu
            );
            assert.deepEqual(adminQueries[0].parameters, [hash, 2]);

            const tenant = runtimeQueries.findIndex(
              q =>
                q.text.includes("set_config('app.current_access_tenant_id'") &&
                q.parameters[0] === a.tenant
            );
            const locked = runtimeQueries.findIndex(
              q =>
                q.text.includes('"optout_token_hash"') &&
                q.text.includes('for update') &&
                q.parameters.includes(a.sponsor_roster_entries)
            );
            const revoked = runtimeQueries.findIndex(q =>
              q.text.startsWith('update "sponsor_roster_entries"')
            );
            const notified = runtimeQueries.findIndex(q =>
              q.text.startsWith('insert into "sponsor_mail_outbox"')
            );
            assert.ok(tenant >= 0 && tenant < locked && locked < revoked && revoked < notified);
            assert.equal(
              new Set(runtimeQueries.slice(tenant, notified + 1).map(q => q.connection)).size,
              1
            );
            assert.ok(
              runtimeQueries
                .slice(0, tenant)
                .some(q => /set local role "interdomestik_runtime_rls"/iu.test(q.text))
            );
            assert.ok(runtimeQueries.slice(notified + 1).some(q => /^commit$/iu.test(q.text)));
            const [origin] = await owner`select revoked_reason, opted_out_at is not null as consumed
          from sponsor_roster_entries where id = ${a.sponsor_roster_entries}`;
            assert.deepEqual(origin, { revoked_reason: 'opted_out', consumed: true });
            const confirmations = await owner`select kind from sponsor_mail_outbox
          where roster_entry_id = ${a.sponsor_roster_entries} and kind = 'opt_out_confirmation'`;
            assert.deepEqual([...confirmations], [{ kind: 'opt_out_confirmation' }]);
            assert.deepEqual(await targetSnapshot(owner, b.tenant), otherBefore);
            assert.deepEqual(await optOutByToken(token, new Date(MID)), { ok: false });

            // Clear the token after the command resolves it and reads the binding, while the
            // production transaction waits for the same identity lock. Only the locked reread
            // can detect this change.
            const changedToken = uid();
            const newEntry = row(a, 'sponsor_roster_entries', true);
            await insert(owner, 'sponsor_roster_entries', {
              ...newEntry,
              optout_token_hash: optOutTokenHash(changedToken),
            });
            let observedLock: () => void = () => {};
            const waitForLock = new Promise<void>(resolve => {
              observedLock = resolve;
            });
            const observed = runtime.options.debug;
            runtime.options.debug = (connection, text, parameters, types) => {
              if (typeof observed === 'function') observed(connection, text, parameters, types);
              if (text.includes('pg_advisory_xact_lock')) observedLock();
            };
            let attempt: ReturnType<typeof optOutByToken> | undefined;
            await owner.begin(async tx => {
              await tx`select pg_advisory_xact_lock(hashtext(${`sponsor-entry:${newEntry.email_hmac}`}))`;
              attempt = optOutByToken(changedToken, new Date(MID));
              await Promise.race([
                waitForLock,
                attempt.then(() => {
                  throw new Error('Opt-out completed before the identity lock');
                }),
              ]);
              await tx`update sponsor_roster_entries set optout_token_hash = null
            where id = ${newEntry.id}`;
            });
            assert.deepEqual(await attempt, { ok: false });
            const unchanged =
              await owner`select opted_out_at, revoked_at, optout_token_hash from sponsor_roster_entries
          where id = ${newEntry.id}`;
            assert.deepEqual(
              [...unchanged],
              [{ opted_out_at: null, revoked_at: null, optout_token_hash: null }]
            );
            const queued =
              await owner`select id from sponsor_mail_outbox where roster_entry_id = ${newEntry.id}`;
            assert.equal(queued.length, 0);
          } finally {
            delete clients.queryClientAdmin;
            delete clients.queryClientRls;
            if (previousRole === undefined) delete process.env.DB_RLS_ROLE;
            else process.env.DB_RLS_ROLE = previousRole;
            if (previousRls === undefined) delete process.env.REQUIRE_RLS_INTEGRATION;
            else process.env.REQUIRE_RLS_INTEGRATION = previousRls;
          }
        }
      );
    }
  );
}
