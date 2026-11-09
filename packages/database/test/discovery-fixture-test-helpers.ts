import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL, Table } from 'drizzle-orm';
import { buildDiscoverySnapshot } from '../src/seed-golden/discovery';
import {
  collectDiscoverySnapshotViolations,
  collectDiscoveryViolations,
  type DiscoverySnapshot,
} from '../src/seed-assert-discovery';
import * as schema from '../src/schema';

type Key = keyof DiscoverySnapshot;
type MutableRow = Record<string, unknown> & { id: string };
const fresh = () => structuredClone(buildDiscoverySnapshot()) as Record<Key, MutableRow[]>;

function checkColumns(key: Key, index: number, row: MutableRow): void {
  for (const field of Object.keys(row)) {
    for (const mutation of ['drift', 'missing'] as const) {
      const changed = fresh();
      if (mutation === 'missing') delete changed[key][index][field];
      else changed[key][index][field] = 'drifted';
      assert.ok(
        collectDiscoverySnapshotViolations(changed).length > 0,
        `${key}.${field} ${mutation}`
      );
    }
  }
  const defaults = fresh();
  defaults[key][index].unexpectedDefault = { nested: true };
  assert.deepEqual(
    collectDiscoverySnapshotViolations(defaults),
    [],
    'DB-default columns are not builder-owned'
  );
}

/** Probe each expected column and row; runtime additions are allowed, seed additions are not. */
export function assertStrictDiscoveryGroup(key: Key): void {
  assert.deepEqual(collectDiscoverySnapshotViolations(fresh()), []);
  for (const [index, row] of fresh()[key].entries()) {
    const missing = fresh();
    missing[key].splice(index, 1);
    assert.ok(
      collectDiscoverySnapshotViolations(missing).some(message => message.includes('missing'))
    );
    checkColumns(key, index, row);
  }
  const extra = fresh();
  extra[key].push({ ...extra[key][0], id: 'golden_unexpected' });
  assert.ok(
    collectDiscoverySnapshotViolations(extra).some(message => message.includes('unexpected'))
  );
  const runtime = fresh();
  runtime[key].push({ ...runtime[key][0], id: 'runtime-created-row' });
  assert.deepEqual(
    collectDiscoverySnapshotViolations(runtime),
    [],
    'non-golden runtime rows are ignored'
  );
  const duplicate = fresh();
  duplicate[key].push({ ...duplicate[key][0] });
  assert.ok(
    collectDiscoverySnapshotViolations(duplicate).some(message => message.includes('duplicate'))
  );
  const substituted = fresh();
  substituted[key][0] = { ...substituted[key][1] };
  assert.ok(
    collectDiscoverySnapshotViolations(substituted).some(message => message.includes('missing'))
  );
}

/** Mirror tenant-prefix.ts:30-46,66-90 for the default claims family, without importing web code. */
export function assertFixtureStoragePath(
  path: string,
  tenantId: string,
  bucket = 'claim-evidence'
): void {
  assert.equal(bucket.trim(), 'claim-evidence');
  assert.ok(tenantId.trim());
  assert.ok(!path.includes('\\'));
  const segments = path.split('/');
  assert.ok(
    segments.every(segment => segment.length > 0 && segment !== '.' && !segment.includes('..'))
  );
  assert.deepEqual(segments.slice(0, 4), ['pii', 'tenants', tenantId.trim(), 'claims']);
  assert.ok(segments.length > 4);
}

/** Compile actual collector predicates: only parent keys, never expected child IDs, restrict reads. */
export async function assertDiscoveryReadScope(): Promise<void> {
  const snapshot = fresh();
  const keys = Object.keys(snapshot) as Key[];
  const queries = new Map<Key, ReturnType<PgDialect['sqlToQuery']>>();
  const dialect = new PgDialect();
  const db = {
    select: () => ({
      from: (table: Table) => ({
        where: (predicate: SQL) => {
          const key = keys.find(candidate => schema[candidate] === table);
          assert.ok(key);
          queries.set(key, dialect.sqlToQuery(predicate));
          return Promise.resolve(snapshot[key]);
        },
      }),
    }),
  } as unknown as Parameters<typeof collectDiscoveryViolations>[0];
  assert.deepEqual(await collectDiscoveryViolations(db, schema), []);
  const expected = buildDiscoverySnapshot();
  const parents = {
    claimDocuments: expected.claimDocuments.map(row => row.claimId),
    documents: ['claim', ...expected.documents.map(row => row.entityId)],
    sharePacks: ['claim', ...expected.sharePacks.map(row => row.entityId)],
    claimMessages: expected.claimMessages.map(row => row.claimId),
    notifications: expected.notifications.map(row => row.userId),
  };
  assert.equal(queries.size, keys.length);
  for (const key of keys) {
    const query = queries.get(key);
    assert.ok(query);
    assert.deepEqual(new Set(query.params), new Set(parents[key]));
    assert.ok(!query.sql.includes('"id"'), `${key} does not select only expected child IDs`);
  }
  snapshot.documents.push({ ...snapshot.documents[0], id: 'golden_extra_document' });
  assert.ok(
    (await collectDiscoveryViolations(db, schema)).some(message =>
      message.includes('golden_extra_document')
    )
  );
}
