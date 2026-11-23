import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';

import {
  mintPaymentPortTestIngress,
  paymentPortTestScheduledAuthority,
  rateInput,
  restricted,
  runSequentially,
} from '../../database/test/exchange-rates.fixture';

import type { ExchangeRatePortFixture } from './exchange-rates-port.fixture';

export async function proveExchangeRateAuthorization(
  t: TestContext,
  fixture: ExchangeRatePortFixture
) {
  const { admin, port, tenantId, otherTenant, actor, session, authority, scheduled, publish } =
    fixture;

  await t.test(
    'denies wrong staff and scheduled authorities and every identity injection',
    async () => {
      const input = rateInput('2026-02-04');
      const deniedSessions = [
        session('member'),
        session('agent'),
        session('staff'),
        session('tenant_admin', otherTenant),
        session('tenant_admin', tenantId, otherTenant),
        session('tenant_admin', tenantId, tenantId, randomUUID()),
      ];
      await runSequentially(deniedSessions, async denied => {
        assert.deepEqual(await port.recordExchangeRate(denied, input, actor), {
          ok: false,
          code: 'forbidden',
        });
      });
      const staffFields = ['storedBy', 'callerKind', 'tenantId', 'stored_by', 'caller_kind'];
      await runSequentially(staffFields, async field => {
        assert.deepEqual(await publish({ ...input, [field]: 'injected' }), {
          ok: false,
          code: 'invalid',
        });
      });
      const scheduledInput = { ...input, tenantId };
      const scheduledFields = [
        'storedBy',
        'callerKind',
        'stored_by',
        'caller_kind',
        'correctsRateId',
        'correctionReason',
      ];
      await runSequentially(scheduledFields, async field => {
        assert.deepEqual(await scheduled({ data: { ...scheduledInput, [field]: 'injected' } }), {
          ok: false,
          code: 'invalid',
        });
      });
      const deniedCapabilities = [
        mintPaymentPortTestIngress('cron'),
        paymentPortTestScheduledAuthority(tenantId),
        authority,
      ];
      await runSequentially(deniedCapabilities, async capability => {
        assert.deepEqual(
          await port.recordExchangeRateScheduled(capability as never, scheduledInput),
          { ok: false, code: 'forbidden' }
        );
      });
      await runSequentially(['', '  ', `unknown_${randomUUID()}`], async deniedTenant => {
        assert.deepEqual(await scheduled({ data: { ...input, tenantId: deniedTenant } }), {
          ok: false,
          code: 'forbidden',
        });
      });
      assert.deepEqual(
        await restricted(admin, tenantId, async tx => [
          ...(await tx`select id from exchange_rates where effective_on = ${input.effectiveOn}`),
        ]),
        []
      );
    }
  );

  await t.test(
    'a session cannot read an eligible rate from its foreign access tenant',
    async () => {
      const foreign = await scheduled({
        data: { ...rateInput('2026-02-11'), tenantId: otherTenant },
      });
      assert.ok(foreign.ok);
      const instant = new Date('2100-01-01T00:00:00.000Z');
      const scheduledAuthority = paymentPortTestScheduledAuthority(otherTenant);
      assert.deepEqual(await port.getExchangeRateInForce(scheduledAuthority, instant), foreign);
      const delegated = session('tenant_admin', tenantId, otherTenant);
      assert.deepEqual(await port.getExchangeRateInForce(delegated, instant), {
        ok: false,
        code: 'forbidden',
      });
    }
  );
}
