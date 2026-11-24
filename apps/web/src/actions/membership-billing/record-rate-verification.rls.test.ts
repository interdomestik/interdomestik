// @vitest-environment node

import {
  firstRate,
  insertRate,
  provisionRateWindow,
  restricted,
  runtimeRole,
  withPaymentPortDatabase,
} from '../../../../../packages/database/test/exchange-rates.fixture';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), headers: vi.fn() }));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));

const enabled = process.env.REQUIRE_RLS_INTEGRATION === '1';

describe.runIf(enabled)('rate verification action with the restricted database role', () => {
  it('denies all wrapped check commands outside their authority and audits refusals', async () => {
    const adminUrl = process.env.E2E_DATABASE_URL;
    if (!adminUrl) throw new Error('E2E_DATABASE_URL is required for the PG16 web RLS proof');
    vi.stubEnv('DATABASE_URL', adminUrl);

    try {
      await withPaymentPortDatabase(async ({ admin }) => {
        const [{ database, serverVersion }] = await admin<
          { database: string; serverVersion: number }[]
        >`
          select current_database() as database,
                 current_setting('server_version_num')::integer as "serverVersion"`;
        expect(database).toMatch(/^wp07_payment_[a-f0-9]+$/u);
        expect(Math.floor(serverVersion / 10_000)).toBe(16);
        // The journal fixture reproduces these existing runtime privileges for the proof.
        await admin.unsafe(
          `grant select, update (id) on public.legal_entities to "${runtimeRole}"`
        );
        await admin.unsafe(`grant insert on public.audit_log to "${runtimeRole}"`);

        const home = randomUUID();
        const access = randomUUID();
        const actorId = randomUUID();
        const legalEntityId = randomUUID();
        const email = `${actorId}@example.test`;
        await admin`insert into tenants (id, name, legal_name, country_code) values
          (${home}, 'Synthetic home', 'Synthetic home', 'MK'),
          (${access}, 'Synthetic access', 'Synthetic access', 'MK')`;
        await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
          values (${actorId}, ${home}, 'Synthetic verifier', ${email}, true, 'tenant_admin', now(), now())`;
        await admin`insert into legal_entities (id, tenant_id, legal_name, country_code, is_active)
          values (${legalEntityId}, ${access}, 'Synthetic entity', 'MK', true)`;
        const rate = await restricted(admin, access, async tx => {
          const [{ bookId, effectiveOn }] = await tx<{ bookId: string; effectiveOn: string }[]>`
            select id as "bookId", (clock_timestamp() at time zone 'Europe/Skopje')::date::text as "effectiveOn"
            from exchange_rate_books`;
          const rate = firstRate(access, bookId, effectiveOn);
          await insertRate(tx, rate);
          return rate;
        });

        const requestHeaders = new Headers();
        mocks.headers.mockResolvedValue(requestHeaders);
        const session = {
          user: {
            id: actorId,
            tenantId: home,
            accessTenantId: access,
            role: 'tenant_admin',
            name: 'Synthetic verifier',
            email,
            branchId: null,
            agentId: null,
          },
          session: {},
        };
        mocks.getSession.mockResolvedValue(session);

        const { authorizeSessionTenant } = await import('@/lib/tenant-authority.server');
        const { readTenantAuthority } = await import('@interdomestik/database/tenant-authority');
        const { withTenantAuthority } =
          await import('@interdomestik/database/tenant-authority-context');
        const authorized = await authorizeSessionTenant(requestHeaders);
        if (!authorized) throw new Error('The fixture session must authenticate');
        expect(authorized.session).toBe(session);
        expect(readTenantAuthority(authorized.authority)).toMatchObject({
          tenantId: access,
          accessTenantId: access,
        });
        await withTenantAuthority(authorized.authority, async tx => {
          const [connection] = await tx.execute<{
            database: string;
            role: string;
            bypass: boolean;
            superuser: boolean;
          }>(sql`select current_database() as database, current_user as role,
            rolbypassrls as bypass, rolsuper as superuser from pg_roles where rolname = current_user`);
          expect(connection).toEqual({
            database,
            role: runtimeRole,
            bypass: false,
            superuser: false,
          });
        });

        const { recordRateVerification } = await import('./record-rate-verification');
        const { beginRateCheck, recordRateCheckInconclusive } = await import('./rate-check');
        const start = { legalEntityId, operationKey: randomUUID() };
        const verification = {
          ...start,
          checkId: randomUUID(),
          rateId: rate.id,
          observedRate: rate.rate,
          sourceRef: 'NBRM/wrapped-action-proof',
        };
        const operations = (checkId: string) => [
          {
            name: 'beginRateCheck',
            run: (fields: Record<string, unknown> = {}) => beginRateCheck({ ...start, ...fields }),
          },
          {
            name: 'recordRateCheckInconclusive',
            run: (fields: Record<string, unknown> = {}) =>
              recordRateCheckInconclusive({ ...start, checkId, reason: 'No bulletin', ...fields }),
          },
          {
            name: 'recordRateVerification',
            run: (fields: Record<string, unknown> = {}) =>
              recordRateVerification({ ...verification, checkId, ...fields }),
          },
        ];
        const counts = async () => {
          const [rows] = await admin`select
            (select count(*)::int from exchange_rate_check_events
              where tenant_id in (${home}, ${access})) as events,
            (select count(*)::int from exchange_rate_verifications
              where tenant_id in (${home}, ${access})) as verifications`;
          return rows;
        };
        const expectRefusals = async (auditActor: string, tenantId: string) => {
          const receipts = await admin`select tenant_id, actor_id, action, entity_id, metadata
            from audit_log where actor_id = ${auditActor} and action = 'action.refused'
            order by entity_id`;
          expect(receipts).toEqual(
            operations(verification.checkId).map(({ name }) => ({
              tenant_id: tenantId,
              actor_id: auditActor,
              action: 'action.refused',
              entity_id: `membershipBilling.${name}`,
              metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'none' } },
            }))
          );
        };
        for (const { run } of operations(verification.checkId)) {
          expect(await run()).toMatchObject({ success: false, code: 'FORBIDDEN' });
        }
        expect(mocks.getSession).toHaveBeenLastCalledWith({ headers: requestHeaders });
        await expectRefusals(actorId, access);
        expect(await counts()).toEqual({ events: 0, verifications: 0 });

        const verifier = randomUUID();
        const verifierEmail = `${verifier}@example.test`;
        await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
          values (${verifier}, ${access}, 'Synthetic same-tenant verifier', ${verifierEmail},
            true, 'tenant_admin', now(), now())`;
        await provisionRateWindow(admin, access, rate.book_id, rate.effective_on);
        const bound = {
          ...session.user,
          id: verifier,
          tenantId: access,
          email: verifierEmail,
        };
        mocks.getSession.mockResolvedValue({ ...session, user: bound });
        expect(await beginRateCheck({ ...start, actorId })).toMatchObject({
          success: false,
          code: 'VALIDATION_ERROR',
        });
        expect(await counts()).toEqual({ events: 0, verifications: 0 });
        const begun = await beginRateCheck(start);
        expect(begun).toMatchObject({ success: true, data: { rateId: rate.id } });
        if (!begun.success || !begun.data) {
          throw new Error('Expected the wrapped check start to return data');
        }

        const secondKey = randomUUID();
        mocks.getSession.mockResolvedValue({ ...session, user: { ...bound, role: 'member' } });
        for (const { run } of operations(begun.data.id)) {
          expect(await run({ operationKey: secondKey })).toMatchObject({
            success: false,
            code: 'FORBIDDEN',
          });
        }
        await expectRefusals(verifier, access);
        expect(await counts()).toEqual({ events: 1, verifications: 0 });

        mocks.getSession.mockResolvedValue({ ...session, user: bound });
        for (const { run } of operations(begun.data.id).slice(1)) {
          expect(await run({ operationKey: secondKey, actorId })).toMatchObject({
            success: false,
            code: 'VALIDATION_ERROR',
          });
        }
        await expectRefusals(verifier, access);
        expect(await counts()).toEqual({ events: 1, verifications: 0 });

        const homeEntity = randomUUID();
        await admin`insert into legal_entities (id, tenant_id, legal_name, country_code, is_active)
          values (${homeEntity}, ${home}, 'Synthetic home entity', 'MK', true)`;
        mocks.getSession.mockResolvedValue({
          ...session,
          user: { ...session.user, accessTenantId: home },
        });
        const foreignStart = await beginRateCheck({ ...start, operationKey: secondKey });
        expect(foreignStart).toMatchObject({ success: false, code: 'NOT_FOUND' });
        expect(foreignStart).toEqual(
          await beginRateCheck({ legalEntityId: randomUUID(), operationKey: secondKey })
        );
        for (const { run } of operations(begun.data.id).slice(1)) {
          const foreign = await run({ operationKey: secondKey, legalEntityId: homeEntity });
          expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND' });
          expect(foreign).toEqual(
            await run({ operationKey: secondKey, legalEntityId: homeEntity, checkId: randomUUID() })
          );
        }
        const homeReceipts = await admin`select entity_id, metadata from audit_log
          where tenant_id = ${home} and actor_id = ${actorId} and action = 'action.refused'
          order by entity_id`;
        expect(homeReceipts).toEqual(
          operations(begun.data.id).flatMap(({ name }) =>
            Array.from({ length: 2 }, () => ({
              entity_id: `membershipBilling.${name}`,
              metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'none' } },
            }))
          )
        );
        expect(await counts()).toEqual({ events: 1, verifications: 0 });

        mocks.getSession.mockResolvedValue({ ...session, user: bound });
        const checked = await recordRateVerification({
          ...start,
          operationKey: randomUUID(),
          checkId: begun.data.id,
          rateId: rate.id,
          observedRate: rate.rate,
          sourceRef: 'NBRM/wrapped-action-proof',
        });
        expect(checked).toMatchObject({
          success: true,
          data: { rateId: rate.id, verifiedBy: verifier },
        });
        const next = await beginRateCheck({ ...start, operationKey: randomUUID() });
        if (!next.success || !next.data) {
          throw new Error('Expected the wrapped recheck to return data');
        }
        expect(
          await recordRateCheckInconclusive({
            ...start,
            operationKey: randomUUID(),
            checkId: next.data.id,
            reason: 'No bulletin',
          })
        ).toMatchObject({ success: true, data: { checkId: next.data.id } });
        expect(await counts()).toEqual({ events: 3, verifications: 1 });
      });
    } finally {
      vi.unstubAllEnvs();
    }
  }, 60_000);
});
