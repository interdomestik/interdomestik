import { claimResponseRequests, type TenantTransaction } from '@interdomestik/database';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { answerClaimResponseRequests, createClaimResponseRequest } from './response-requests';

const pg = new PgDialect();
const subject = { tenantId: 'tenant-1', claimId: 'claim-1' };

describe('claim response requests in the caller transaction', () => {
  it('records the qualifying source id and uses the post-lock database clock', async () => {
    const values = vi.fn();
    const insert = vi.fn((_table: typeof claimResponseRequests) => ({ values }));
    const tx = { insert } as unknown as TenantTransaction;
    await createClaimResponseRequest(tx, {
      ...subject,
      kind: 'member_message',
      messageId: 'request',
    });
    await createClaimResponseRequest(tx, { ...subject, kind: 'claim_submitted' });

    expect(insert.mock.calls).toEqual([[claimResponseRequests], [claimResponseRequests]]);
    expect(
      values.mock.calls.map(([row]) => [
        row.kind,
        row.sourceMessageId,
        pg.sqlToQuery(row.requestedAt).sql,
      ])
    ).toEqual([
      ['member_message', 'request', 'clock_timestamp()'],
      ['claim_submitted', null, 'clock_timestamp()'],
    ]);
  });

  it('restricts status answers and preserves the first answer when messages follow', async () => {
    const where = vi.fn();
    const set = vi.fn(
      (_patch: { answeredAt: Parameters<typeof pg.sqlToQuery>[0]; answeredBy: string }) => ({
        where,
      })
    );
    const update = vi.fn((_table: typeof claimResponseRequests) => ({ set }));
    const tx = { update } as unknown as TenantTransaction;
    await answerClaimResponseRequests(tx, { ...subject, actorId: 'admin', kind: 'status_change' });
    await answerClaimResponseRequests(tx, {
      ...subject,
      actorId: 'staff',
      kind: 'public_message',
      messageId: 'answer',
    });

    const [status, message] = where.mock.calls.map(([condition]) => pg.sqlToQuery(condition));
    expect(update.mock.calls).toEqual([[claimResponseRequests], [claimResponseRequests]]);
    expect(status.sql).toMatch(/"answered_at" is null.*"kind" = /);
    expect(status.params).toEqual(['tenant-1', 'claim-1', 'claim_submitted']);
    expect(message.sql).toMatch(/"answered_at" is null/);
    expect(message.params).toEqual(['tenant-1', 'claim-1']);
    expect(
      set.mock.calls.map(([patch]) => ({
        ...patch,
        answeredAt: pg.sqlToQuery(patch.answeredAt).sql,
      }))
    ).toEqual([
      {
        answeredAt: '(select clock_timestamp())',
        answeredBy: 'admin',
        answerKind: 'member_visible_status_change',
        answerMessageId: null,
      },
      {
        answeredAt: '(select clock_timestamp())',
        answeredBy: 'staff',
        answerKind: 'public_staff_message',
        answerMessageId: 'answer',
      },
    ]);
  });
});
