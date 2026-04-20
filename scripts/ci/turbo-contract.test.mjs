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
  assert.ok(
    turboConfig.globalEnv.includes('NEXT_PUBLIC_UI_V2'),
    'turbo globalEnv must include NEXT_PUBLIC_UI_V2 for production landing builds'
  );
});

test('turbo build forwards production Paddle entity env', () => {
  assert.ok(Array.isArray(turboConfig.globalEnv));
  assert.ok(
    turboConfig.globalEnv.includes('PADDLE_DEFAULT_BILLING_ENTITY'),
    'turbo globalEnv must include PADDLE_DEFAULT_BILLING_ENTITY for production pricing builds'
  );
  assert.ok(
    turboConfig.globalEnv.includes('NEXT_PUBLIC_PADDLE_BILLING_ENTITY'),
    'turbo globalEnv must include NEXT_PUBLIC_PADDLE_BILLING_ENTITY for production pricing builds'
  );
  assert.ok(
    turboConfig.globalEnv.includes('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_*'),
    'turbo globalEnv must include NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_* for entity checkout builds'
  );
  assert.ok(
    turboConfig.globalEnv.includes('PADDLE_API_KEY_*'),
    'turbo globalEnv must include PADDLE_API_KEY_* for entity billing builds'
  );
  assert.ok(
    turboConfig.globalEnv.includes('PADDLE_WEBHOOK_SECRET_KEY_*'),
    'turbo globalEnv must include PADDLE_WEBHOOK_SECRET_KEY_* for entity billing builds'
  );
});
