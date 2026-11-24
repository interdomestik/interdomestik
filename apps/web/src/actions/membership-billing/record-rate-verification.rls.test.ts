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
  it('refuses a split-tenant session and commits one receipt in the access tenant', async () => {
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
        expect(
          await recordRateVerification({
            legalEntityId,
            rateId: rate.id,
            observedRate: rate.rate,
            sourceRef: `NBRM:${rate.effective_on}`,
            operationKey: randomUUID(),
          })
        ).toMatchObject({ success: false, code: 'FORBIDDEN' });
        expect(await beginRateCheck(start)).toMatchObject({ success: false, code: 'FORBIDDEN' });
        expect(
          await recordRateCheckInconclusive({
            ...start,
            checkId: randomUUID(),
            reason: 'No bulletin',
          })
        ).toMatchObject({ success: false, code: 'FORBIDDEN' });
        expect(mocks.getSession).toHaveBeenLastCalledWith({ headers: requestHeaders });

        const receipts = await admin`select tenant_id, actor_id, action, entity_id, metadata
          from audit_log where actor_id = ${actorId} and action = 'action.refused'
          order by entity_id`;
        expect(receipts).toEqual(
          ['beginRateCheck', 'recordRateCheckInconclusive', 'recordRateVerification'].map(name => ({
            tenant_id: access,
            actor_id: actorId,
            action: 'action.refused',
            entity_id: `membershipBilling.${name}`,
            metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'none' } },
          }))
        );
        const evidence =
          await admin`select id from exchange_rate_verifications where tenant_id in (${home}, ${access})`;
        expect(evidence).toEqual([]);

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
        mocks.getSession.mockResolvedValue({ ...session, user: { ...bound, role: 'member' } });
        expect(await beginRateCheck(start)).toMatchObject({ success: false, code: 'FORBIDDEN' });
        mocks.getSession.mockResolvedValue({ ...session, user: bound });
        expect(await beginRateCheck({ ...start, actorId: verifier })).toMatchObject({
          success: false,
          code: 'VALIDATION_ERROR',
        });
        const begun = await beginRateCheck(start);
        expect(begun).toMatchObject({ success: true, data: { rateId: rate.id } });
        if (!begun.success || !begun.data) {
          throw new Error('Expected the wrapped check start to return data');
        }
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
      });
    } finally {
      vi.unstubAllEnvs();
    }
  }, 60_000);
});
