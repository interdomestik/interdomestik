import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, it, vi } from 'vitest';

// Receipt persistence is system-level; tenant effect writes still use the real
// withTenantContext and its dedicated NOSUPERUSER NOBYPASSRLS connection.
vi.mock('@interdomestik/database', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database')>();
  return { ...actual, db: actual.dbAdmin };
});

// Explicit local integration lane; ordinary unit runs need no database.
it.skipIf(process.env.RUN_DUNNING_POSTGRES !== '1')(
  'commits and recovers ordered effects under a real non-bypass RLS role',
  async () => {
    const url = process.env.DATABASE_URL!;
    expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
    const admin = postgres(url, { max: 1 });
    const suffix = randomUUID().replaceAll('-', '');
    const role = `s6_recovery_${suffix}`;
    const userId = `s6_user_${suffix}`;
    const subscriptionId = `s6_sub_${suffix}`;
    const tenantId = 'tenant_ks';
    const scope = {
      tenantId,
      subscriptionId,
      providerSubscriptionId: subscriptionId,
      order: {
        occurredAt: '2026-09-27T10:00:01Z',
        providerEventId: `evt_${suffix}`,
        processingScopeKey: 'entity:ks',
      },
    };
    try {
      await admin.unsafe(
        `create role "${role}" login password '${suffix}' nosuperuser nobypassrls`
      );
      await admin.unsafe(`grant "${role}" to postgres`);
      await admin.unsafe(`grant usage on schema public to "${role}"`);
      await admin.unsafe(
        `grant select, insert, update on subscriptions, audit_log, engagement_email_sends to "${role}"`
      );
      await admin.unsafe(`grant select on webhook_events, domain_events to "${role}"`);
      await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt") values
        (${userId}, ${tenantId}, 'Synthetic recovery', ${`${userId}@example.test`}, true, 'member', now(), now())`;
      await admin`insert into subscriptions (id, tenant_id, user_id, status, plan_id, provider_subscription_id, provider_event_id, provider_event_occurred_at)
        values (${subscriptionId}, ${tenantId}, ${userId}, 'active', 'standard', ${subscriptionId}, 'evt_previous', '2026-09-27T10:00:00Z')`;
      const rlsUrl = new URL(url);
      rlsUrl.username = role;
      rlsUrl.password = suffix;
      vi.stubEnv('DATABASE_URL_RLS', rlsUrl.toString());
      vi.stubEnv('DB_RLS_ROLE', '');
      vi.stubEnv('REQUIRE_RLS_INTEGRATION', '1');
      const { withTenantContext, sql } = await import('@interdomestik/database');
      const { insertWebhookEvent, markWebhookFailed } = await import('../persist');
      const { isRetryablePaddleWebhookError } = await import('../errors');
      const { handleOrderedPastDue } = await import('./dunning-ordered-handler');
      const { persistOrderedPastDueSubscription } = await import('./dunning-order');
      const { deliverPastDueEffects } = await import('./dunning-effects');
      const buildState = (row: { dunningAttemptCount: number | null }) => ({
        values: {
          status: 'past_due' as const,
          dunningAttemptCount: (row.dunningAttemptCount ?? 0) + 1,
        },
        newDunningCount: (row.dunningAttemptCount ?? 0) + 1,
        gracePeriodEnd: new Date('2026-10-11T10:00:00Z'),
      });
      await withTenantContext({ tenantId, role: 'system' }, async tx => {
        const [posture] = await tx.execute(
          sql`select current_user as role, rolbypassrls, rolsuper from pg_roles where rolname = current_user`
        );
        expect(posture).toMatchObject({ role, rolbypassrls: false, rolsuper: false });
      });
      await expect(
        persistOrderedPastDueSubscription({
          ...scope,
          buildState,
          persistEffects: async () => {
            throw new Error('injected atomic failure');
          },
        })
      ).rejects.toThrow('injected atomic failure');
      const [unchanged] =
        await admin`select status, dunning_attempt_count from subscriptions where id = ${subscriptionId}`;
      expect(unchanged).toMatchObject({ status: 'active', dunning_attempt_count: 0 });

      const deps = {
        preparePastDueEmail: vi.fn(() => ({
          from: 'a@example.test',
          to: 'b@example.test',
          subject: 'Due',
          html: '<p>Due</p>',
          text: 'Due',
        })),
        sendPreparedPastDueEmail: vi
          .fn()
          .mockRejectedValueOnce(new Error('injected post-commit outage'))
          .mockResolvedValue({ success: true, id: 'synthetic-message' }),
      };
      const args = {
        ...scope,
        buildState,
        deps,
        planName: 'Membership',
        user: { id: userId, tenantId, email: 'b@example.test', name: 'Synthetic' },
      };
      const receipt = {
        headers: new Headers(),
        processingScopeKey: scope.order.processingScopeKey,
        dedupeKey: `paddle:entity:ks:event:${scope.order.providerEventId}`,
        eventType: 'subscription.past_due',
        eventId: scope.order.providerEventId,
        eventTimestamp: new Date(scope.order.occurredAt),
        payloadHash: suffix,
        parsedPayload: { data: { id: subscriptionId } },
        signatureValid: true,
        signatureBypassed: false,
        tenantId,
      };
      const admit = (input = receipt) => insertWebhookEvent(input);
      const first = await admit();
      expect(first.inserted).toBe(true);
      await expect(handleOrderedPastDue(args)).rejects.toMatchObject({
        name: 'RetryablePaddleWebhookError',
        message: 'injected post-commit outage',
      });
      // Simulate process death before the receipt is marked failed: active leases
      // defer delivery, then the exact abandoned receipt becomes reclaimable.
      await expect(admit()).rejects.toMatchObject({
        name: 'RetryablePaddleWebhookError',
      });
      await admin`update webhook_events set received_at = now() - interval '6 minutes' where id = ${first.webhookEventRowId!}`;
      expect(await admit({ ...receipt, payloadHash: 'different' })).toMatchObject({
        inserted: false,
      });
      expect(await admit()).toEqual(first);
      deps.sendPreparedPastDueEmail.mockRejectedValueOnce(new Error('retryable sender outage'));
      const failure = await handleOrderedPastDue(args).catch(error => error);
      expect(isRetryablePaddleWebhookError(failure)).toBe(true);
      await markWebhookFailed({
        ...receipt,
        webhookEventRowId: first.webhookEventRowId!,
        error: failure,
        retryable: true,
      });
      expect(await admit()).toEqual(first);
      const audit = await admin`select id from audit_log where entity_id = ${subscriptionId}`;
      const pending =
        await admin`select status from engagement_email_sends where subscription_id = ${subscriptionId}`;
      expect(audit).toHaveLength(1);
      expect(pending).toMatchObject([{ status: 'pending' }]);
      let enteredSend!: () => void;
      const entered = new Promise<void>(resolve => {
        enteredSend = resolve;
      });
      let releaseSend!: () => void;
      const paused = new Promise<void>(resolve => {
        releaseSend = resolve;
      });
      deps.sendPreparedPastDueEmail.mockImplementationOnce(async () => {
        enteredSend();
        await paused;
        return { success: true, id: 'synthetic-message' };
      });
      const replay = handleOrderedPastDue(args);
      await entered;
      try {
        // A newer writer cannot take the subscription row while recovery sends.
        await expect(
          admin.begin(
            tx => tx`select id from subscriptions where id = ${subscriptionId} for update nowait`
          )
        ).rejects.toMatchObject({ code: '55P03' });
      } finally {
        releaseSend();
      }
      await replay;
      await admin`update subscriptions set status = 'active', provider_event_id = 'evt_newer', provider_event_occurred_at = '2026-09-27T10:00:02Z' where id = ${subscriptionId}`;
      await handleOrderedPastDue(args); // Reverse order: newer snapshot suppresses recovery.

      expect(deps.sendPreparedPastDueEmail).toHaveBeenCalledTimes(3);
      expect(vi.mocked(deps.sendPreparedPastDueEmail).mock.calls[2]).toEqual(
        vi.mocked(deps.sendPreparedPastDueEmail).mock.calls[0]
      );
      const [completed] =
        await admin`select dunning_attempt_count from subscriptions where id = ${subscriptionId}`;
      expect(completed.dunning_attempt_count).toBe(1);
      expect(
        await admin`select id from audit_log where entity_id = ${subscriptionId}`
      ).toHaveLength(1);
      expect(
        await admin`select status from engagement_email_sends where subscription_id = ${subscriptionId}`
      ).toMatchObject([{ status: 'sent' }]);
      await expect(
        deliverPastDueEffects({ ...scope, tenantId: 'tenant_mk' }, deps)
      ).rejects.toThrow('no tenant-scoped row');
      await withTenantContext({ tenantId: 'tenant_mk', role: 'system' }, async tx => {
        expect(
          await tx.execute(
            sql`select id from engagement_email_sends where subscription_id = ${subscriptionId}`
          )
        ).toHaveLength(0);
        expect(
          await tx.execute(sql`select id from audit_log where entity_id = ${subscriptionId}`)
        ).toHaveLength(0);
      });
    } finally {
      await admin`delete from webhook_events where event_id = ${scope.order.providerEventId}`;
      await admin`delete from engagement_email_sends where subscription_id = ${subscriptionId}`;
      await admin`delete from audit_log where entity_id = ${subscriptionId}`;
      await admin`delete from subscriptions where id = ${subscriptionId}`;
      await admin`delete from "user" where id = ${userId}`;
      await admin.unsafe(`drop owned by "${role}"`);
      await admin.unsafe(`drop role "${role}"`);
      await admin.end();
      vi.unstubAllEnvs();
    }
  },
  30_000
);
