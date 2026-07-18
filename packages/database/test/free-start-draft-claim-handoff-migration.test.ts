import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file: string) => readFile(path.join(root, file), 'utf8');

test('C14/C19/C20 handoff migration provides only the authoritative linkage backstop', async () => {
  const [schema, migration, journalText, snapshotText] = await Promise.all([
    source('src/schema/claim-core.ts'),
    source('drizzle/0093_ida_ui03a2_draft_claim_handoff.sql'),
    source('drizzle/meta/_journal.json'),
    source('drizzle/meta/0093_snapshot.json'),
  ]);
  assert.match(
    schema,
    /claim_free_start_draft_origin_uq[\s\S]*table\.tenantId[\s\S]*table\.userId[\s\S]*table\.origin[\s\S]*table\.originRefId[\s\S]*free_start_draft/
  );
  assert.match(
    migration,
    /claim_free_start_draft_origin_uq[\s\S]*tenant_id[\s\S]*userId[\s\S]*origin[\s\S]*origin_ref_id[\s\S]*free_start_draft/
  );
  assert.equal((migration.match(/CREATE UNIQUE INDEX/g) ?? []).length, 1);
  assert.doesNotMatch(migration, /ALTER TABLE|FOREIGN KEY|CASCADE|free_start_drafts.*REFERENCES/i);

  const journal = JSON.parse(journalText) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.at(-1)?.idx, 93);
  assert.equal(journal.entries.at(-1)?.tag, '0093_ida_ui03a2_draft_claim_handoff');
  const snapshot = JSON.parse(snapshotText) as {
    tables: Record<string, { indexes?: Record<string, unknown> }>;
  };
  assert.ok(snapshot.tables['public.claim']?.indexes?.claim_free_start_draft_origin_uq);
});
