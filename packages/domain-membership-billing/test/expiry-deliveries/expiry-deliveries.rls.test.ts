import type { VerifiedRecipient } from '@interdomestik/domain-communications/recipient-locale';
import { expect, it, vi } from 'vitest';

import {
  recipientScratchMissing,
  tenantA,
} from '../../../database/test/wp11-verified-recipient-rls.fixture';
import {
  absentId,
  foreignId,
  recipientId,
  staffId,
  withExpiryFixture,
} from './expiry-deliveries.rls.fixture';

vi.mock(
  import('../../src/expiry-deliveries/delivery-queries'),
  () => import('./expiry-deliveries.rls.fixture')
);

vi.mock('@interdomestik/database/tenant-authority-context', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@interdomestik/database/tenant-authority-context')>();
  return { ...actual, withTenantAuthority: vi.fn(actual.withTenantAuthority) };
});

it.runIf(process.env.BILLING_RLS_INTEGRATION === '1')(
  'uses one restricted pool connection and records only fixed outcomes for each delivery key',
  async context => {
    const skip = recipientScratchMissing();
    if (skip) return context.skip(skip);

    await withExpiryFixture(
      1,
      async ({ admin, authority, email, enqueue, record, appPoolSize }) => {
        // Resolve the async mock before the worker imports it, so both use the same spy.
        const transactions = await import('@interdomestik/database/tenant-authority-context');
        const { createExpiryDeliveryWorker } = await import('../../src/expiry-deliveries');
        expect(appPoolSize()).toBe(1);
        const accepted = () => Response.json({ id: 'provider-private-ref' });
        const provider = vi.fn(async (_url: string, _request: RequestInit) => accepted());
        const message = {
          subject: 'Private subject',
          html: '<p>Private body</p>',
          text: 'Private body',
        };
        const render = vi.fn((_periodId: string, _recipient: VerifiedRecipient) => message);
        vi.stubGlobal('fetch', provider);
        vi.stubEnv('RESEND_API_KEY', 'synthetic-test-key');
        vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
        vi.stubEnv('PLAYWRIGHT', '0');
        const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
        let now = Date.now();
        const options = {
          transport: 'resend',
          timeoutMs: 500,
          finishReserveMs: 1000,
          render,
          now: () => now,
        } as const;
        const worker = createExpiryDeliveryWorker(options);
        async function claim(period: string) {
          const result = await worker.claim(authority, period);
          expect(result).toMatchObject({ ok: true });
          if (!result.ok) throw new Error(result.code);
          return result.claim;
        }

        try {
          await enqueue('normal');
          await enqueue('normal');
          const first = await claim('normal');
          expect(JSON.parse(JSON.stringify(first))).toEqual({
            periodId: 'normal',
            leaseToken: first.leaseToken,
            handle: {},
          });
          const sent = { ok: true, state: 'sent' };
          let originalRecipient: VerifiedRecipient | undefined;
          render.mockImplementationOnce((_periodId, recipient) => {
            originalRecipient = { ...recipient };
            Object.assign(recipient, { email: 'other@example.test' });
            return message;
          });
          expect(await worker.dispatch(authority, first)).toEqual(sent);
          expect(provider).toHaveBeenCalledOnce();
          expect(provider).toHaveBeenCalledWith(
            'https://api.resend.com/emails',
            expect.objectContaining({
              headers: expect.objectContaining({ 'Idempotency-Key': 'opaque-normal' }),
            })
          );
          expect(JSON.parse(String(provider.mock.calls[0][1].body))).toMatchObject({ to: [email] });
          expect(render).toHaveBeenCalledExactlyOnceWith('normal', {
            email: 'other@example.test',
            locale: 'sq',
          });
          expect(originalRecipient).toEqual({ email, locale: 'sq' });
          expect(await record('normal')).toMatchObject({
            state: 'sent',
            attempts: 1,
            authorization: null,
          });
          await enqueue('normal');
          expect(await worker.claim(authority, 'normal')).toEqual({
            ok: false,
            code: 'lease_unavailable',
          });
          expect(await worker.dispatch(authority, first)).toEqual({
            ok: false,
            code: 'lease_lost',
          });
          expect(provider).toHaveBeenCalledOnce();

          for (const [period, member] of [
            ['foreign', foreignId],
            ['staff', staffId],
            ['absent', absentId],
            ['unlinked', null],
          ] as const) {
            await enqueue(period, member);
            const refusal = { ok: false, code: 'recipient_missing' };
            expect(await worker.claim(authority, period)).toEqual(refusal);
            // A live claim whose locked source loses its recipient is also refused at dispatch.
            await enqueue(`dispatch-${period}`);
            const ready = await claim(`dispatch-${period}`);
            await admin`update expiry_fixture_period set member_id = ${member}
            where tenant_id = ${tenantA} and period_id = ${`dispatch-${period}`}`;
            expect(await worker.dispatch(authority, ready)).toEqual(refusal);
            expect(await record(`dispatch-${period}`)).toMatchObject({
              state: 'queued',
              code: refusal.code,
            });
          }

          await enqueue('role-loss');
          const roleLoss = await claim('role-loss');
          await admin`update "user" set role = 'staff' where id = ${recipientId}`;
          expect(await worker.dispatch(authority, roleLoss)).toEqual({
            ok: false,
            code: 'recipient_missing',
          });
          await admin`update "user" set role = 'member' where id = ${recipientId}`;
          expect(provider).toHaveBeenCalledOnce();

          await enqueue('abandoned');
          const stale = await claim('abandoned');
          now += 10 * 60_000;
          await admin`update user_locale_preferences set locale = 'de' where user_id = ${recipientId}`;
          const fresh = await claim('abandoned');
          expect(fresh.leaseToken).not.toEqual(stale.leaseToken);
          expect(await worker.dispatch(authority, stale)).toEqual({
            ok: false,
            code: 'lease_lost',
          });
          expect(provider).toHaveBeenCalledOnce();
          expect(await worker.dispatch(authority, fresh)).toEqual(sent);
          expect(render).toHaveBeenLastCalledWith('abandoned', { email, locale: 'de' });
          expect(provider).toHaveBeenCalledTimes(2);

          await enqueue('deadline');
          const expiring = await claim('deadline');
          render.mockImplementationOnce(() => {
            now += options.timeoutMs;
            return { subject: 'Too late', text: 'Too late', html: '<p>Too late</p>' };
          });
          expect(await worker.dispatch(authority, expiring)).toEqual({
            ok: false,
            code: 'transport_deadline_elapsed',
          });
          expect(await record('deadline')).toMatchObject({ state: 'queued', authorization: null });
          expect(provider).toHaveBeenCalledTimes(2);

          await enqueue('rolled-back');
          const rolledBack = await claim('rolled-back');
          const transaction = vi.mocked(transactions.withTenantAuthority);
          const realTransaction = transaction.getMockImplementation()!;
          let rolledBackResult: unknown;
          transaction.mockImplementationOnce((scope, action) =>
            realTransaction(scope, async tx => {
              rolledBackResult = await action(tx);
              throw new Error('private rolled-back SQL parameters');
            })
          );
          expect(await worker.dispatch(authority, rolledBack)).toEqual({
            ok: false,
            code: 'expiry_operational_failure',
          });
          expect(rolledBackResult).toMatchObject({
            ok: true,
            authorization: { leaseToken: rolledBack.leaseToken },
          });
          expect(await record('rolled-back')).toMatchObject({
            state: 'claimed',
            authorization: null,
          });
          expect(provider).toHaveBeenCalledTimes(2);

          await enqueue('unconfirmed');
          const unconfirmed = await claim('unconfirmed');
          transaction.mockImplementationOnce(async (scope, action) => {
            await realTransaction(scope, action);
            throw new Error('private response after commit');
          });
          expect(await worker.dispatch(authority, unconfirmed)).toEqual({
            ok: false,
            code: 'expiry_operational_failure',
          });
          const committed = await record('unconfirmed');
          expect(committed.authorization).toMatchObject({ leaseToken: unconfirmed.leaseToken });
          now += 10 * 60_000;
          const restarted = createExpiryDeliveryWorker(options);
          expect(await restarted.claim(authority, 'unconfirmed')).toEqual({
            ok: false,
            code: 'reconciliation_required',
          });
          expect(await record('unconfirmed')).toEqual(committed);
          expect(provider).toHaveBeenCalledTimes(2);

          await enqueue('provider-failures');
          provider.mockImplementation(() =>
            Promise.resolve(new Response('private response body', { status: 429 }))
          );
          for (let attempt = 1; attempt <= 8; attempt += 1) {
            const ready = await claim('provider-failures');
            expect(await worker.dispatch(authority, ready)).toEqual({
              ok: false,
              code: 'resend_failed',
            });
            const row = await record('provider-failures');
            expect(row).toMatchObject({
              state: attempt < 8 ? 'queued' : 'failed',
              attempts: attempt,
              code: 'resend_failed',
              authorization: null,
            });
            if (row.nextAttemptAt !== null) {
              expect(row.nextAttemptAt).toBeGreaterThan(now);
              expect(await worker.claim(authority, 'provider-failures')).toEqual({
                ok: false,
                code: 'lease_unavailable',
              });
              now = row.nextAttemptAt;
            }
          }
          const failures =
            await admin`select reference, metadata->>'code' as code from expiry_fixture_delivery
          where metadata->>'state' = 'failed'`;
          expect([...failures]).toEqual([
            { reference: 'opaque-provider-failures', code: 'resend_failed' },
          ]);

          await enqueue('ambiguous');
          provider.mockRejectedValueOnce(
            Object.assign(new Error(`Private body for ${email}`), {
              name: 'ProviderRefA123',
              code: 'PROVIDER_REF_123',
            })
          );
          const ambiguous = await claim('ambiguous');
          expect(await worker.dispatch(authority, ambiguous)).toEqual({
            ok: false,
            code: 'resend_unknown',
          });
          now += 10 * 60_000;
          expect(await worker.claim(authority, 'ambiguous')).toEqual({
            ok: false,
            code: 'reconciliation_required',
          });
          expect(await record('ambiguous')).toMatchObject({
            state: 'claimed',
            code: 'resend_unknown',
            authorization: { leaseToken: ambiguous.leaseToken },
          });
          expect(logger.mock.calls).toEqual([[{ code: 'resend_unknown' }]]);

          const rows = await admin`select metadata from expiry_fixture_delivery`;
          const persisted = JSON.stringify(rows);
          for (const privateField of [
            email,
            recipientId,
            'locale',
            'Private body',
            'ProviderRefA123',
            'PROVIDER_REF_123',
            'provider-private-ref',
            'xmin',
            'ctid',
            'handle',
          ]) {
            expect(persisted).not.toContain(privateField);
          }
        } finally {
          vi.restoreAllMocks();
          vi.unstubAllGlobals();
          vi.unstubAllEnvs();
        }
      }
    );
  },
  120_000
);
