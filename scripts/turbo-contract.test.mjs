import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const turboConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'turbo.json'), 'utf8')
);

test('turbo build forwards production Supabase separation env', () => {
  assert.ok(Array.isArray(turboConfig.globalEnv));
  assert.ok(
    turboConfig.globalEnv.includes('SUPABASE_PRODUCTION_PROJECT_REF'),
    'turbo globalEnv must include SUPABASE_PRODUCTION_PROJECT_REF for production builds'
  );
});
