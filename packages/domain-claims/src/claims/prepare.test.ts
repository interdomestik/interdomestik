import type { TenantTransaction } from '@interdomestik/database';
import { type SQL } from 'drizzle-orm';
import { PgDialect, type SelectedFields } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { describe, expect, it, vi } from 'vitest';
import { CLAIM_MAIL_COPY } from '@interdomestik/domain-communications/notification-deliveries/worker';
import { prepareNotificationDelivery } from './prepare-notification-delivery';
import { delivery } from './run.test-support';

const original = {
  ...delivery({ state: 'claimed', kind: 'staff_member_message' }),
  leaseUntil: '2026-11-22T12:10:00.000Z',
};

function setup(responses: object[][]) {
  const where = vi.fn().mockImplementation(() => {
    const rows = Promise.resolve(responses.shift() ?? []);
    return Object.assign(rows, { for: () => rows, orderBy: () => ({ for: () => rows }) });
  });
  const routingQuery = vi.fn().mockResolvedValue({ rows: [] });
  const routingDb = drizzle(routingQuery);
  const select = vi.fn((fields?: SelectedFields) => {
    const candidateFields = fields && 'branchId' in fields && !('emailVerified' in fields);
    const selectionFields = fields && 'id' in fields && Object.keys(fields).length === 1;
    if (fields && (candidateFields || selectionFields)) return routingDb.select(fields);
    return { from: () => ({ where }) };
  });
  const tx = { select } as unknown as TenantTransaction;
  const deps = {
    appOrigin: () => 'https://example.test',
  };
  return { tx, deps, select, where, routingQuery };
}

describe('prepareNotificationDelivery', () => {
  it('locks the current lease and short-circuits a delivery at the 72 hour cutoff', async () => {
    const h = setup([[{ ...original, stale: true }]]);
    await expect(prepareNotificationDelivery(h.tx, original, h.deps)).resolves.toEqual({
      skip: 'stale',
    });
    expect(h.select).toHaveBeenCalledOnce();
    const fields = h.select.mock.calls[0][0] as { stale: SQL };
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(fields.stale).sql).toBe(
      `"notification_deliveries"."created_at" + interval '72 hours' <= clock_timestamp()`
    );
    expect(dialect.sqlToQuery(h.where.mock.calls[0][0]).params).toEqual([
      original.tenantId,
      original.id,
      'claimed',
      original.leaseUntil,
    ]);
  });

  it('skips staff whose access was removed without looking up locale or rendering', async () => {
    const h = setup([
      [{ ...original, stale: false }],
      [{ ownerId: 'different-user', category: 'vehicle', claimNumber: 'CLM-1', staffId: null }],
      [
        {
          id: original.recipientUserId,
          role: 'staff',
          branchId: 'previous-branch',
          emailVerified: true,
        },
      ],
    ]);
    await expect(prepareNotificationDelivery(h.tx, original, h.deps)).resolves.toEqual({
      skip: 'recipient_out_of_scope',
    });
    const [query, params] = h.routingQuery.mock.calls[0];
    expect(query).toContain('"user"."tenant_id" =');
    expect(query).toContain('"claim"."tenant_id" =');
    expect(query).toContain('"claim"."branch_id" = "notification_candidates"."branch_id"');
    expect(query).toContain('"notification_candidates"."branch_id" is null');
    expect(query).toContain('for share');
    expect(params).toEqual(
      expect.arrayContaining([
        original.tenantId,
        original.claimId,
        'draft',
        original.recipientUserId,
      ])
    );
    expect(h.where).toHaveBeenCalledTimes(3);
    expect(h.routingQuery).toHaveBeenCalledOnce();
  });

  it.each(['staff', 'tenant_admin'])(
    'skips a queued %s when another assignee now qualifies',
    async role => {
      const recipient = {
        id: original.recipientUserId,
        role,
        branchId: 'branch',
        email: 'recipient@example.test',
        emailVerified: true,
      };
      const assignee = { ...recipient, id: 'current-assignee', role: 'staff' };
      const h = setup([
        [original],
        [{ ownerId: 'member', staffId: assignee.id, category: 'vehicle', claimNumber: 'CLM-1' }],
        [recipient],
      ]);
      h.routingQuery.mockResolvedValue({ rows: [[assignee.id]] });
      await expect(prepareNotificationDelivery(h.tx, original, h.deps)).resolves.toEqual({
        skip: 'recipient_out_of_scope',
      });
      const [query, params] = h.routingQuery.mock.calls[0];
      expect(query).toContain('order by "notification_candidates"."role" =');
      expect(query).toContain('"notification_candidates"."id" is not distinct from');
      expect(params).toContain(assignee.id);
    }
  );

  it.each([1, 100])('checks staff eligibility in one query with %i staff', async count => {
    const staff = Array.from({ length: count }, (_, index) => ({
      id: `staff-${index}`,
      role: 'staff',
      emailVerified: true,
    }));
    const h = setup([
      [original],
      [{ ownerId: 'member', staffId: null, category: 'vehicle', claimNumber: 'CLM-1' }],
      [{ id: original.recipientUserId, role: 'tenant_admin', emailVerified: true }],
      staff,
    ]);
    h.routingQuery.mockResolvedValueOnce({ rows: [[staff[count - 1].id]] });
    await expect(prepareNotificationDelivery(h.tx, original, h.deps)).resolves.toEqual({
      skip: 'recipient_out_of_scope',
    });
    expect(h.where.mock.calls.length + h.routingQuery.mock.calls.length).toBe(4);
  });

  it.each([
    { role: 'member', previewRestricted: true },
    { role: 'branch_manager', previewRestricted: false },
  ])(
    'only renders generic copy when enqueue or the current role restricts previews',
    async ({ role, previewRestricted }) => {
      const row = {
        ...original,
        kind: 'claim_message_to_member' as const,
        facts: { previewRestricted },
        subjectMessageId: 'private-message',
      };
      const h = setup([
        [row],
        [{ ownerId: row.recipientUserId, category: 'vehicle', claimNumber: null }],
        [{ id: row.recipientUserId, role, emailVerified: true, email: 'owner@example.test' }],
        [{ locale: 'mk' }],
      ]);
      const result = await prepareNotificationDelivery(h.tx, row, h.deps);
      expect(result).toMatchObject({
        channel: 'email',
        locale: 'mk',
        rendered: {
          subject: CLAIM_MAIL_COPY.mk.messages.claim_message_to_member.restricted.subject,
        },
      });
      expect(h.select).toHaveBeenCalledTimes(4);
    }
  );

  it('rechecks that a claim owner still has a verified email', async () => {
    const row = { ...original, kind: 'claim_submitted' as const };
    const h = setup([
      [row],
      [{ ownerId: row.recipientUserId, category: 'vehicle', claimNumber: null }],
      [{ id: row.recipientUserId, role: 'agent', emailVerified: false }],
    ]);
    await expect(prepareNotificationDelivery(h.tx, row, h.deps)).resolves.toEqual({
      skip: 'email_unverified',
    });
  });

  it.each(['claim_message_to_member', 'claim_status_changed'] as const)(
    'rechecks the push preference for %s',
    async kind => {
      const row = {
        ...original,
        kind,
        channel: 'push' as const,
        pushSubscriptionId: 'subscription',
      };
      const h = setup([
        [row],
        [{ ownerId: row.recipientUserId, category: 'vehicle', claimNumber: null }],
        [{ id: row.recipientUserId, role: 'member', emailVerified: true }],
        [
          {
            pushMessages: kind !== 'claim_message_to_member',
            pushClaimUpdates: kind !== 'claim_status_changed',
          },
        ],
      ]);
      await expect(prepareNotificationDelivery(h.tx, row, h.deps)).resolves.toEqual({
        skip: 'push_disabled',
      });
      expect(h.select).toHaveBeenCalledTimes(4);
    }
  );
});
