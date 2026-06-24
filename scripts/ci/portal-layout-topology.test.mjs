import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluatePortalLayoutTopology } from '../check-portal-layout-topology.mjs';

const expectedLayouts = [
  'apps/web/src/app/[locale]/(app)/member/layout.tsx',
  'apps/web/src/app/[locale]/(agent)/agent/layout.tsx',
  'apps/web/src/app/[locale]/(staff)/staff/layout.tsx',
  'apps/web/src/app/[locale]/admin/layout.tsx',
];

const requiredAgentPages = [
  'apps/web/src/app/[locale]/(agent)/agent/import/page.tsx',
  'apps/web/src/app/[locale]/(agent)/agent/pos/page.tsx',
];

const comparePath = (left, right) => left.localeCompare(right);

function write(root, relativePath, source = 'export default function Page() { return null; }\n') {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-layout-topology-'));
  for (const file of [...expectedLayouts, ...requiredAgentPages]) write(root, file);
  return root;
}

test('passes with exactly four canonical portal layouts', () => {
  const root = fixture();
  const result = evaluatePortalLayoutTopology(root);

  assert.equal(result.ok, true);
  assert.deepEqual(result.portalLayouts, [...expectedLayouts].sort(comparePath));
});

test('fails when legacy routes remain', () => {
  const root = fixture();
  write(root, 'apps/web/src/app/[locale]/legacy/agent/layout.tsx');

  const result = evaluatePortalLayoutTopology(root);

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /Forbidden route surface exists/u);
});

test('fails when dashboard agent routes remain', () => {
  const root = fixture();
  write(root, 'apps/web/src/app/[locale]/(dashboard)/agent/import/page.tsx');

  const result = evaluatePortalLayoutTopology(root);

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /\(dashboard\)\/agent/u);
});

test('fails when a portal layout becomes a client shell', () => {
  const root = fixture();
  write(
    root,
    expectedLayouts[0],
    "'use client';\nexport default function Layout() { return null; }\n"
  );

  const result = evaluatePortalLayoutTopology(root);

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /server shells/u);
});

test('fails when a nested portal layout is added', () => {
  const root = fixture();
  write(root, 'apps/web/src/app/[locale]/(agent)/agent/settings/layout.tsx');

  const result = evaluatePortalLayoutTopology(root);

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /Unexpected portal layout files/u);
});

test('fails when a route-group agent layout is added', () => {
  const root = fixture();
  write(root, 'apps/web/src/app/[locale]/(agent)/layout.tsx');

  const result = evaluatePortalLayoutTopology(root);

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /Unexpected portal layout files/u);
});
