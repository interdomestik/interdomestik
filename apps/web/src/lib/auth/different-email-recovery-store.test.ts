import { tenantSettings, verification } from '@interdomestik/database/schema';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { expect, it, vi } from 'vitest';
import { confirmReplacementProof } from './different-email-recovery-store';

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('@interdomestik/database/db', () => ({ dbAdmin: { transaction } }));

const userId = 'owner';
const tenantId = 'tenant_ks';
const oldEmail = 'Current@Example.test';
const newEmail = 'Replacement@Example.test';
const now = new Date('2026-11-23T12:00:00Z');
const dialect = new PgDialect();

function prepareTransaction(
  updated: { id: string }[],
  switchRows: { value: unknown }[] = [{ value: { enabled: true, revision: 1 } }]
) {
  const order: (string | unknown[])[] = [];
  const limit = vi
    .fn()
    .mockResolvedValueOnce([
      {
        expiresAt: new Date(now.getTime() + 60_000),
        value: JSON.stringify({ active: true, digest: 'fixture-digest', oldEmail, newEmail }),
      },
    ])
    .mockResolvedValueOnce([{ id: userId, email: oldEmail }])
    .mockResolvedValueOnce([]);
  const deleteWhere = vi.fn(async (predicate: SQL) => {
    order.push(dialect.sqlToQuery(predicate).params);
  });
  const remove = vi.fn(() => ({ where: deleteWhere }));
  const lockSwitch = vi.fn(async (lock: string) => {
    order.push(lock);
    return switchRows;
  });
  const whereSwitch = vi.fn((_predicate: SQL) => ({ limit: () => ({ for: lockSwitch }) }));
  const tx = {
    execute: vi.fn(async () => {
      order.push('lock');
    }),
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: table === tenantSettings ? whereSwitch : () => ({ limit }),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            order.push('email update');
            return updated;
          },
        }),
      }),
    })),
    delete: remove,
  };
  transaction.mockReset().mockImplementation(async work => {
    order.push('begin');
    const result = await work(tx);
    order.push('commit');
    return result;
  });
  return { order, remove, deleteWhere, whereSwitch, update: tx.update };
}

it('deletes both canonical sign-in identifiers after the email update and before commit', async () => {
  const { order, remove, deleteWhere, whereSwitch } = prepareTransaction([{ id: userId }]);

  expect(await confirmReplacementProof(userId, tenantId, () => 'fixture-digest', now)).toEqual({
    ok: true,
  });

  expect(transaction).toHaveBeenCalledOnce();
  expect(order).toEqual([
    'begin',
    'lock',
    'lock',
    'share',
    'email update',
    [userId, 'reset-password:%'],
    ['sign-in-otp-current@example.test', 'sign-in-otp-replacement@example.test'],
    ['ida-ui03b:owner:replacement'],
    'commit',
  ]);
  expect(remove.mock.calls).toEqual([[verification], [verification], [verification]]);
  expect(dialect.sqlToQuery(whereSwitch.mock.calls[0]![0]).params).toEqual([
    tenantId,
    'pilot',
    'public_intake',
  ]);
  expect(dialect.sqlToQuery(deleteWhere.mock.calls[1]![0]).sql).toBe(
    '"verification"."identifier" in ($1, $2)'
  );
});

it('preserves reset and sign-in challenges when the email update changes no row', async () => {
  const { order } = prepareTransaction([]);

  expect(await confirmReplacementProof(userId, tenantId, () => 'fixture-digest', now)).toEqual({
    ok: false,
  });

  expect(transaction).toHaveBeenCalledOnce();
  expect(order).toEqual([
    'begin',
    'lock',
    'lock',
    'share',
    'email update',
    ['ida-ui03b:owner:replacement'],
    'commit',
  ]);
});

it.each([
  { state: 'closed', rows: [{ value: { enabled: false, revision: 1 } }] },
  { state: 'absent', rows: [] },
  { state: 'malformed', rows: [{ value: { enabled: true, revision: '1' } }] },
])('leaves the address and proofs intact when the switch row is $state', async ({ rows }) => {
  const { order, remove, update } = prepareTransaction([{ id: userId }], rows);
  expect(await confirmReplacementProof(userId, tenantId, () => 'fixture-digest', now)).toEqual({
    ok: false,
    code: 'CLOSED',
  });
  expect(order).toEqual(['begin', 'lock', 'lock', 'share', 'commit']);
  expect(update).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
