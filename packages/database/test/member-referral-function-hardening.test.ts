import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  'drizzle/0073_harden_member_referral_reward_type_functions.sql',
  'utf8'
);

function normalizeSqlStatement(statement: string): string {
  let normalized = statement
    .trim()
    .replaceAll('\n', ' ')
    .replaceAll('\r', ' ')
    .replaceAll('\t', ' ');
  while (normalized.includes('  ')) {
    normalized = normalized.replaceAll('  ', ' ');
  }
  return normalized;
}

const migrationSql = migration
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

const sqlStatements = migrationSql
  .split(';')
  .map(statement => normalizeSqlStatement(statement))
  .filter(Boolean)
  .map(statement => `${statement};`);

const alterFunctionStatements = sqlStatements.filter(statement =>
  statement.toUpperCase().startsWith('ALTER FUNCTION ')
);

describe('member referral function hardening migration', () => {
  it('pins search_path for Supabase-advised enum helper functions', () => {
    assert.equal(alterFunctionStatements.length, 2);
    assert.match(
      migration,
      /ALTER FUNCTION public\.member_referral_reward_type_fixed\(\) SET search_path = public, pg_temp;/
    );
    assert.match(
      migration,
      /ALTER FUNCTION public\.member_referral_reward_type_percent\(\) SET search_path = public, pg_temp;/
    );
  });

  it('does not introduce broad schema or RLS changes', () => {
    const upperStatements = sqlStatements.map(statement => statement.toUpperCase());

    for (const statement of upperStatements) {
      assert.equal(statement.startsWith('CREATE FUNCTION '), false);
      assert.equal(statement.startsWith('CREATE OR REPLACE FUNCTION '), false);
      assert.equal(statement.startsWith('CREATE TABLE '), false);
      assert.equal(statement.startsWith('CREATE TYPE '), false);
      assert.equal(statement.startsWith('CREATE POLICY '), false);
      assert.equal(statement.startsWith('DROP TABLE '), false);
      assert.equal(statement.startsWith('DROP TYPE '), false);
      assert.equal(statement.startsWith('DROP POLICY '), false);
      assert.equal(statement.startsWith('DROP FUNCTION '), false);
      assert.equal(statement.includes(' ENABLE ROW LEVEL SECURITY'), false);
    }
  });
});
