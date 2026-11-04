import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { readLocalDocumentAccess } from './document-access-reads';

/** Every select resolves to no rows and records its where condition. */
function emptyDb() {
  const conditions: SQL[] = [];
  const chain = {
    leftJoin: () => chain,
    where: (condition: SQL) => {
      conditions.push(condition);
      return Promise.resolve([]);
    },
  };
  return { db: { select: vi.fn(() => ({ from: () => chain })) }, conditions };
}

describe('readLocalDocumentAccess soft-delete filtering', () => {
  it('looks up only live polymorphic documents of the access tenant', async () => {
    const { db, conditions } = emptyDb();

    await readLocalDocumentAccess({
      db: db as never,
      documentId: 'doc-1',
      finalDisposition: 'attachment',
      mode: 'signed_url',
      session: { user: { id: 'member-1' } },
      tenantId: 'tenant-ks',
      userRole: 'member',
    });

    const lookup = new PgDialect().sqlToQuery(conditions[0]);
    expect(lookup.sql).toMatch(/"documents"\."deleted_at" is null/);
    expect(lookup.params).toEqual(['doc-1', 'tenant-ks']);
  });
});
