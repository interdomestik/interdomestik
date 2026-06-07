import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../drizzle/0074_drop_duplicate_legacy_indexes.sql', import.meta.url),
  'utf8'
);

function sqlStatements(): string[] {
  return migration
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map(statement => `${statement};`);
}

const statements = sqlStatements();

describe('duplicate index cleanup migration', () => {
  it('drops only legacy duplicate index names flagged by Supabase Performance Advisor', () => {
    assert.deepEqual(statements, [
      'DROP INDEX IF EXISTS public.idx_branches_tenant_id;',
      'DROP INDEX IF EXISTS public.idx_claim_agent_id;',
      'DROP INDEX IF EXISTS public.idx_claim_branch_id;',
      'DROP INDEX IF EXISTS public.idx_subscriptions_agent_id;',
      'DROP INDEX IF EXISTS public.idx_subscriptions_branch_id;',
    ]);
  });

  it('keeps canonical Drizzle-declared index names intact', () => {
    for (const retainedName of [
      'idx_branches_tenant',
      'idx_claims_agent',
      'idx_claims_branch',
      'idx_memberships_agent',
      'idx_memberships_branch',
    ]) {
      assert.equal(statements.includes(`DROP INDEX IF EXISTS public.${retainedName};`), false);
    }
  });

  it('does not introduce broad schema, data, function, or RLS changes', () => {
    for (const statement of statements.map(value => value.toUpperCase())) {
      assert.equal(statement.startsWith('CREATE '), false);
      assert.equal(statement.startsWith('ALTER '), false);
      assert.equal(statement.startsWith('UPDATE '), false);
      assert.equal(statement.startsWith('DELETE '), false);
      assert.equal(statement.startsWith('INSERT '), false);
      assert.equal(statement.startsWith('DROP TABLE '), false);
      assert.equal(statement.startsWith('DROP TYPE '), false);
      assert.equal(statement.startsWith('DROP POLICY '), false);
      assert.equal(statement.startsWith('DROP FUNCTION '), false);
      assert.equal(statement.includes(' ENABLE ROW LEVEL SECURITY'), false);
    }
  });
});
