import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Plan070 dataset: every synthetic E2E identity comes from one catalogue
// (packages/database/src/e2e-users.ts). Seeds and tests reference catalogue keys or e2eEmail(),
// never a spelled address, and the local/CI release-gate defaults name the catalogue's accounts.
// Changing the identity domain is then one catalogue edit plus these checked defaults.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogue = await import(path.join(ROOT, 'packages/database/src/e2e-users.ts'));
const { E2E_USERS, E2E_EMAIL_DOMAIN, e2eEmail } = catalogue;

// Code that seeds or exercises the E2E dataset. `seed:full` is a separate local demo dataset with
// its own spec; it is outside this catalogue by design.
const GUARDED_ROOTS = [
  'apps/web/e2e',
  'packages/database/src/seed-golden',
  'packages/database/src/seed-packs',
];
const GUARDED_FILES = [
  'packages/database/src/e2e-role-fixtures.ts',
  'packages/database/src/verify-golden.ts',
];
const OUTSIDE_CATALOGUE = new Set(['apps/web/e2e/full-seed.spec.ts']);

// Local/CI release-gate account defaults; hosted staging/production use environment secrets.
const RELEASE_GATE_DEFAULT_FILES = [
  '.github/workflows/pilot-gate.yml',
  '.github/workflows/release-candidate.yml',
  'scripts/ci/z620-resource-run.mjs',
  'scripts/ci-local-parity.sh',
];
const RELEASE_GATE_ACCOUNTS = Object.freeze({
  MEMBER: 'KS_MEMBER',
  AGENT: 'KS_AGENT',
  OFFICE_AGENT: 'KS_AGENT_INACTIVE_LINK',
  STAFF: 'KS_STAFF',
  ADMIN_KS: 'KS_ADMIN',
  ADMIN_MK: 'MK_ADMIN',
});

function sourceFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx|mjs|js)$/.test(entry.name) ? [relative] : [];
  });
}

function releaseGateDefaults(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const pattern = /RELEASE_GATE_([A-Z_]+?)_EMAIL['":\s]+([^'"\s,]+@[^'"\s,]+)/g;
  return [...text.matchAll(pattern)].map(([, account, email]) => ({ account, email }));
}

test('catalogue: every identity is unique and lives in the one E2E domain', () => {
  const emails = Object.values(E2E_USERS).map(user => user.email);
  assert.equal(new Set(emails).size, emails.length, 'duplicate catalogue email');
  for (const email of emails) assert.ok(email.endsWith(`@${E2E_EMAIL_DOMAIN}`), email);
  assert.equal(e2eEmail('x.y'), `x.y@${E2E_EMAIL_DOMAIN}`);
});

test('seeds and E2E tests never spell an identity address', () => {
  const files = [...GUARDED_ROOTS.flatMap(sourceFiles), ...GUARDED_FILES].filter(
    file => !OUTSIDE_CATALOGUE.has(file)
  );
  assert.ok(files.length > 100, `guarded file set unexpectedly small: ${files.length}`);
  const spelled = new RegExp(`@(interdomestik\\.com|${E2E_EMAIL_DOMAIN.replaceAll('.', '\\.')})`);
  const offenders = files.filter(file =>
    spelled.test(fs.readFileSync(path.join(ROOT, file), 'utf8'))
  );
  assert.deepEqual(offenders, [], 'use E2E_USERS.<KEY>.email or e2eEmail(local)');
});

test('local/CI release-gate defaults name the catalogue accounts', () => {
  for (const file of RELEASE_GATE_DEFAULT_FILES) {
    const defaults = releaseGateDefaults(file);
    assert.deepEqual(
      defaults.map(entry => entry.account).sort(),
      Object.keys(RELEASE_GATE_ACCOUNTS).sort(),
      `${file}: release-gate default accounts`
    );
    for (const { account, email } of defaults)
      assert.equal(email, E2E_USERS[RELEASE_GATE_ACCOUNTS[account]].email, `${file}: ${account}`);
  }
});
