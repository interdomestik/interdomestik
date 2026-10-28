import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createCrmFixture } from './db-access-crm-runtime-fixture.mjs';
const root = import.meta.dirname;
const fixture = await createCrmFixture(process.env.DATABASE_URL, root);
let result;
try {
  result = spawnSync(process.execPath, ['db-access-crm-runtime-child.mjs'], {
    cwd: root,
    shell: false,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      PATH: '/usr/bin:/bin',
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      TZ: 'UTC',
      LANG: 'C.UTF-8',
      NODE_ENV: 'production',
      CI: 'true',
      DATABASE_URL: fixture.adminUrl,
      DATABASE_URL_RLS: fixture.restrictedUrl,
      DB_RLS_ROLE: fixture.role,
      DB_MAX_CONNECTIONS: '8',
      CRM_BACKFILL_CONFIRMATION_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: 'http://ida.localhost:3000',
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
    },
  });
  const secrets = [
    fixture.adminUrl,
    fixture.restrictedUrl,
    decodeURIComponent(new URL(fixture.adminUrl).password),
    decodeURIComponent(new URL(fixture.restrictedUrl).password),
  ];
  const redact = text =>
    secrets.reduce((s, secret) => s.split(secret).join('[REDACTED]'), text ?? '');
  process.stdout.write(redact(result.stdout));
  process.stderr.write(redact(result.stderr));
  if (result.error || result.signal || result.status !== 0)
    throw new Error('CRM actual cases failed');
} finally {
  await fixture.retire();
}
const report = JSON.parse(fs.readFileSync('crm-cases-result.json'));
fs.writeFileSync(
  'crm-completion.json',
  JSON.stringify({
    ...report,
    setupComplete: true,
    teardownComplete: true,
    postgres: fixture.postgres,
    runtimeAdmission: false,
  })
);
