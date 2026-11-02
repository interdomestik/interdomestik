import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { appendCaseGrantDocumentAudit } from '../src/case-grant-document-audit';
import { dbAdmin } from '../src/db';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';

// Each select answers from the next queued row set: the document's case from the selected table,
// then the reader's grant.
function mockAdmin(t: test.TestContext, answers: unknown[][]) {
  const selects: Array<{ columns: unknown; where: unknown }> = [];
  const inserts: unknown[] = [];
  t.mock.method(dbAdmin, 'select', ((columns: unknown) => {
    const call = { columns, where: undefined as unknown };
    selects.push(call);
    const rows = answers.shift() ?? [];
    const chain = {
      from: () => chain,
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      limit: () => Promise.resolve(rows),
    };
    return chain;
  }) as unknown as typeof dbAdmin.select);
  t.mock.method(dbAdmin, 'insert', (() => ({
    values: (values: unknown) => {
      inserts.push(values);
      return Promise.resolve();
    },
  })) as unknown as typeof dbAdmin.insert);
  return { selects, inserts };
}

const reader = () => mintTestTenantAuthority('tenant_mk', { userId: 'legal-1', role: 'staff' });
const event = {
  homeTenantId: 'tenant_ks',
  documentId: 'doc-1',
  source: 'claim_documents' as const,
  action: 'document.view',
  entityType: 'claim_document',
  metadata: { disposition: 'inline' },
};

test('a grant-confirmed case document read is recorded in the home tenant', async t => {
  const { selects, inserts } = mockAdmin(t, [[{ caseId: 'claim-1' }], [{ id: 'grant-1' }]]);

  assert.equal(await appendCaseGrantDocumentAudit(reader(), event), true);

  const grant = new PgDialect().sqlToQuery(selects[1].where as never);
  assert.match(grant.sql, /"tenant_id" = \$1 and .*"access_tenant_id" = \$2/u);
  assert.match(grant.sql, /"revoked_at" is null/u);
  assert.deepEqual(grant.params.slice(0, 5), [
    'tenant_ks',
    'tenant_mk',
    'tenant_mk',
    'claim-1',
    'legal-1',
  ]);
  assert.equal(inserts.length, 1);
  assert.deepEqual(
    { ...(inserts[0] as Record<string, unknown>), id: 'id' },
    {
      id: 'id',
      tenantId: 'tenant_ks',
      actorId: 'legal-1',
      actorRole: 'staff',
      action: 'document.view',
      entityType: 'claim_document',
      entityId: 'doc-1',
      metadata: { disposition: 'inline', accessTenantId: 'tenant_mk', viaCaseScopedGrant: true },
    }
  );
});

test('a polymorphic read resolves its case only from the documents table', async t => {
  const { selects, inserts } = mockAdmin(t, [[{ caseId: 'claim-2' }], [{ id: 'grant-2' }]]);
  assert.equal(
    await appendCaseGrantDocumentAudit(reader(), { ...event, source: 'documents' }),
    true
  );
  assert.equal(selects.length, 2);
  assert.match(
    new PgDialect().sqlToQuery(selects[0].where as never).sql,
    /"documents"\."entity_type" = \$3/u
  );
  assert.equal(new PgDialect().sqlToQuery(selects[1].where as never).params[3], 'claim-2');
  assert.equal(inserts.length, 1);
});

test('a same-id row in the other table can neither drop nor redirect the audit', async t => {
  // The read selected the polymorphic document on case A; a legacy row with the same id on case B
  // is never consulted, so the append checks the case-A grant only.
  const { selects } = mockAdmin(t, [[{ caseId: 'case-A' }], [{ id: 'grant-A' }]]);
  assert.equal(
    await appendCaseGrantDocumentAudit(reader(), { ...event, source: 'documents' }),
    true
  );
  const dialect = new PgDialect();
  assert.doesNotMatch(dialect.sqlToQuery(selects[0].where as never).sql, /claim_documents/u);
  assert.equal(dialect.sqlToQuery(selects[1].where as never).params[3], 'case-A');
});

test('an unknown source writes nothing and never queries', async t => {
  const { selects, inserts } = mockAdmin(t, [[{ caseId: 'claim-1' }], [{ id: 'grant-1' }]]);
  assert.equal(
    await appendCaseGrantDocumentAudit(reader(), { ...event, source: 'claims' as never }),
    false
  );
  assert.equal(selects.length, 0);
  assert.equal(inserts.length, 0);
});

test('no active grant, or no home case document, writes nothing', async t => {
  const noGrant = mockAdmin(t, [[{ caseId: 'claim-1' }], []]);
  assert.equal(await appendCaseGrantDocumentAudit(reader(), event), false);
  assert.equal(noGrant.inserts.length, 0);
});

test('a document outside any home case writes nothing', async t => {
  const { inserts } = mockAdmin(t, [[]]);
  assert.equal(await appendCaseGrantDocumentAudit(reader(), event), false);
  assert.equal(inserts.length, 0);
});

test('own-tenant, principal-less, unlisted or oversized events never query', async t => {
  const { selects, inserts } = mockAdmin(t, [[{ caseId: 'claim-1' }], [{ id: 'grant-1' }]]);
  const refused = [
    appendCaseGrantDocumentAudit(reader(), { ...event, homeTenantId: 'tenant_mk' }),
    appendCaseGrantDocumentAudit(mintTestTenantAuthority('tenant_mk'), event),
    appendCaseGrantDocumentAudit(reader(), { ...event, action: 'document.delete' }),
    appendCaseGrantDocumentAudit(reader(), { ...event, entityType: 'user' }),
    appendCaseGrantDocumentAudit(reader(), { ...event, documentId: '  ' }),
    appendCaseGrantDocumentAudit(reader(), { ...event, metadata: { blob: 'x'.repeat(4096) } }),
  ];
  assert.deepEqual(await Promise.all(refused), [false, false, false, false, false, false]);
  assert.equal(selects.length, 0);
  assert.equal(inserts.length, 0);
});

test('a forged authority is refused before any query', async t => {
  const { selects } = mockAdmin(t, []);
  await assert.rejects(appendCaseGrantDocumentAudit({} as never, event));
  assert.equal(selects.length, 0);
});
