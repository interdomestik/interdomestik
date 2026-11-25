import { NextRequest } from 'next/server';
import { expect, type Mock } from 'vitest';

import { END, type Scope } from '../../../../../../../packages/database/test/sponsor-test-fixture';
import {
  addEntry,
  addMail,
  CRON_BEARER,
  LIVE_END,
  NOW,
  type Admin,
} from './sponsor-routes.test-support';

export type SendEmail = typeof import('@interdomestik/domain-communications/email').sendEmail;

export async function verifyHourlyCron(
  admin: Admin,
  scope: Scope,
  liveTerm: string,
  sendEmail: Mock<SendEmail>
) {
  const { GET } = await import('./route');
  const runCron = () =>
    GET(
      new NextRequest('http://localhost/api/cron/sponsors', {
        headers: { authorization: `Bearer ${CRON_BEARER}` },
      })
    );
  const heldId = scope.sponsor_roster_entries;
  const terminalId = scope.sponsor_mail_outbox;
  await admin`update sponsor_handover_intents set next_attempt_at = ${LIVE_END}
    where id = ${scope.sponsor_handover_intents}`;
  await admin`update sponsor_mail_outbox set state = 'sent', terminal_at = ${END}, attempts = 1
    where id = ${terminalId}`;

  const heldRoster = () => admin`select * from sponsor_roster_entries where id = ${heldId}`;
  const heldMail = () => admin`select * from sponsor_mail_outbox where id = ${terminalId}`;
  const rosterBefore = await heldRoster();
  const mailBefore = await heldMail();
  expect(rosterBefore).toHaveLength(1);
  expect(mailBefore).toHaveLength(1);
  const queued = await addMail(admin, scope, heldId, {
    attempts: 2,
    last_error_code: 'send_failed',
  });
  const abandoned = await addMail(admin, scope, heldId, {
    kind: 'renewal_notice',
    attempts: 1,
    state: 'claimed',
    lease_until: END,
  });
  const eligible = await addEntry(admin, scope, liveTerm, scope.user);
  const delivery = await addMail(admin, scope, eligible.id);
  sendEmail.mockImplementation(async (_to, _template, options) =>
    options?.canDispatch?.() === false
      ? { success: false, error: 'email_dispatch_blocked' }
      : { success: true, id: 'synthetic-delivery' }
  );

  const response = await runCron();
  expect.soft(response.status).toBe(200);
  expect.soft(await response.json()).toMatchObject({
    success: true,
    timestamp: NOW,
    tenants: expect.arrayContaining([
      expect.objectContaining({
        tenantId: scope.tenant,
        failed: false,
        retention: { state: 'skipped', reason: 'sponsor_retention_dormant' },
        mail: { claimed: 3, outcomes: { sent: 1, skipped: 2 } },
      }),
    ]),
  });
  // Both fixtures are due for destructive retention.
  expect.soft(await heldRoster()).toEqual(rosterBefore);
  expect.soft(await heldMail()).toEqual(mailBefore);
  const mailResult = (id: string) => admin`select state, attempts, last_error_code, lease_until
    from sponsor_mail_outbox where id = ${id}`;
  // These otherwise deliverable retries were due.
  expect
    .soft(await mailResult(queued))
    .toEqual([{ state: 'skipped', attempts: 3, last_error_code: 'aged_mail', lease_until: null }]);
  expect
    .soft(await mailResult(abandoned))
    .toEqual([{ state: 'skipped', attempts: 2, last_error_code: 'aged_mail', lease_until: null }]);
  // Only the fresh delivery reaches the adapter.
  expect
    .soft(sendEmail)
    .toHaveBeenCalledExactlyOnceWith(
      `${scope.user}@example.test`,
      { subject: expect.any(String), text: expect.any(String), html: expect.any(String) },
      { canDispatch: expect.any(Function) }
    );
  expect
    .soft(await mailResult(delivery))
    .toEqual([{ state: 'sent', attempts: 1, last_error_code: null, lease_until: null }]);

  const next = await addEntry(admin, scope, liveTerm, scope.staff);
  const failedDelivery = await addMail(admin, scope, next.id);
  sendEmail.mockClear();
  sendEmail.mockResolvedValueOnce({ success: false, error: 'synthetic-provider-failure' });
  const failed = await runCron();
  // sponsor-cron.core.ts:122–130 and route.ts:25–29. The tenant reports a retryable mail failure.
  expect.soft(failed.status).toBe(500);
  expect.soft(await failed.json()).toMatchObject({
    success: false,
    tenants: expect.arrayContaining([
      expect.objectContaining({
        tenantId: scope.tenant,
        failed: true,
        failedSteps: ['mail'],
        mail: { claimed: 1, outcomes: { queued: 1 } },
      }),
      expect.objectContaining({ tenantId: 'tenant_mk', failed: false }),
    ]),
  });
  expect
    .soft(sendEmail)
    .toHaveBeenCalledExactlyOnceWith(`${scope.staff}@example.test`, expect.anything(), {
      canDispatch: expect.any(Function),
    });
  expect
    .soft(await mailResult(failedDelivery))
    .toEqual([{ state: 'queued', attempts: 1, last_error_code: 'send_failed', lease_until: null }]);
  return eligible.id;
}
