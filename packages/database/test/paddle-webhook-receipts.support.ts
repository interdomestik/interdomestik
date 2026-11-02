import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';

export type InsertCall = {
  table: unknown;
  values: Record<string, unknown> | undefined;
  conflictTarget: 'nothing' | undefined;
  returning: unknown;
};
export type UpdateCall = {
  table: unknown;
  set: Record<string, unknown> | undefined;
  where: unknown;
  returning: unknown;
};
export type SelectCall = { columns: unknown; from: unknown; where: unknown; limit: unknown };

export function compile(fragment: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(fragment as Parameters<typeof dialect.sqlToQuery>[0]);
}

// Timestamp columns serialise bound dates to ISO strings.
export function isTimestampParam(param: unknown): param is string | Date {
  return param instanceof Date || (typeof param === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(param));
}

export function mockInsert(t: test.TestContext, returningRows: unknown[] = []) {
  const calls: InsertCall[] = [];
  const method = t.mock.method(dbAdmin, 'insert', ((table: unknown) => {
    const call: InsertCall = {
      table,
      values: undefined,
      conflictTarget: undefined,
      returning: undefined,
    };
    calls.push(call);
    // Awaiting the chain directly (no `.returning`) and awaiting `.returning(...)` both resolve.
    const conflict = Object.assign(Promise.resolve(undefined), {
      returning: (columns: unknown) => {
        call.returning = columns;
        return Promise.resolve(returningRows);
      },
    });
    const chain = {
      values: (values: Record<string, unknown>) => {
        call.values = values;
        return chain;
      },
      onConflictDoNothing: () => {
        call.conflictTarget = 'nothing';
        return conflict;
      },
    };
    return chain;
  }) as unknown as typeof dbAdmin.insert);
  return { calls, method };
}

export function mockUpdate(t: test.TestContext, returningRows: unknown[]) {
  const calls: UpdateCall[] = [];
  const method = t.mock.method(dbAdmin, 'update', ((table: unknown) => {
    const call: UpdateCall = { table, set: undefined, where: undefined, returning: undefined };
    calls.push(call);
    const chain = {
      set: (set: Record<string, unknown>) => {
        call.set = set;
        return chain;
      },
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      returning: (columns: unknown) => {
        call.returning = columns;
        return Promise.resolve(returningRows);
      },
    };
    return chain;
  }) as unknown as typeof dbAdmin.update);
  return { calls, method };
}

export function mockSelect(t: test.TestContext, rows: unknown[]) {
  const calls: SelectCall[] = [];
  const method = t.mock.method(dbAdmin, 'select', ((columns: unknown) => {
    const call: SelectCall = { columns, from: undefined, where: undefined, limit: undefined };
    calls.push(call);
    const chain = {
      from: (table: unknown) => {
        call.from = table;
        return chain;
      },
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      limit: (limit: unknown) => {
        call.limit = limit;
        return Promise.resolve(rows);
      },
    };
    return chain;
  }) as unknown as typeof dbAdmin.select);
  return { calls, method };
}

export const EVIDENCE = {
  processingScopeKey: 'entity:mk',
  dedupeKey: 'paddle:entity:mk:event:evt_1',
  eventType: 'subscription.created',
  eventId: 'evt_1',
  eventTimestamp: new Date('2026-09-25T08:00:00.000Z'),
  payloadHash: 'hash_1',
  payload: { data: { id: 'sub_1' } },
};

export const VERIFIED = { ...EVIDENCE, providerTransactionId: 'txn_1', tenantId: 'tenant_mk' };
