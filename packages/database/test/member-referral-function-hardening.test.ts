import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  'drizzle/0073_harden_member_referral_reward_type_functions.sql',
  'utf8'
);

const alterFunctionStatements = migration.match(/ALTER\s+FUNCTION\s+[^;]+;/gi) ?? [];

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
    assert.doesNotMatch(migration, /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    assert.doesNotMatch(migration, /CREATE\s+(TABLE|TYPE|POLICY)/i);
    assert.doesNotMatch(migration, /DROP\s+(TABLE|TYPE|POLICY|FUNCTION)/i);
    assert.doesNotMatch(migration, /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });
});
