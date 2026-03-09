import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ENV_EXAMPLE_PATH = path.join(process.cwd(), '.env.example');
const SENTINEL_SECRET_PATTERN =
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]?[A-Za-z0-9._-]{20,}/;

test('.env.example keeps the Supabase service role placeholder out of sentinel secret-scan shape', () => {
  const envExample = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  assert.equal(
    SENTINEL_SECRET_PATTERN.test(envExample),
    false,
    '.env.example contains a secret-shaped SUPABASE_SERVICE_ROLE_KEY placeholder'
  );
});
