#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORTAL_LAYOUTS = [
  'apps/web/src/app/[locale]/(app)/member/layout.tsx',
  'apps/web/src/app/[locale]/(agent)/agent/layout.tsx',
  'apps/web/src/app/[locale]/(staff)/staff/layout.tsx',
  'apps/web/src/app/[locale]/admin/layout.tsx',
];

const REQUIRED_CANONICAL_PAGES = [
  'apps/web/src/app/[locale]/(agent)/agent/import/page.tsx',
  'apps/web/src/app/[locale]/(agent)/agent/pos/page.tsx',
];

const FORBIDDEN_PATHS = [
  'apps/web/src/app/[locale]/legacy',
  'apps/web/src/app/[locale]/(dashboard)/agent',
];

const ROUTE_ROOT = 'apps/web/src/app/[locale]';
const comparePath = (left, right) => left.localeCompare(right);
const PORTAL_ROOTS = PORTAL_LAYOUTS.map(file => file.replace(/\/layout\.tsx$/u, ''));
const FORBIDDEN_GROUP_LAYOUTS = [
  'apps/web/src/app/[locale]/(agent)/layout.tsx',
  'apps/web/src/app/[locale]/(staff)/layout.tsx',
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walkFiles(root, dir, results = []) {
  const absoluteDir = path.join(root, dir);
  if (!fs.existsSync(absoluteDir)) return results;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, relativePath, results);
      continue;
    }
    results.push(toPosix(relativePath));
  }

  return results;
}

function isPortalLayoutCandidate(file) {
  if (!file.endsWith('/layout.tsx')) return false;
  if (PORTAL_LAYOUTS.includes(file)) return true;
  if (FORBIDDEN_GROUP_LAYOUTS.includes(file)) return true;
  if (PORTAL_ROOTS.some(portalRoot => file.startsWith(`${portalRoot}/`))) return true;
  if (file.includes('/legacy/')) return true;
  if (file.includes('/(dashboard)/agent/')) return true;
  return /^apps\/web\/src\/app\/\[locale\]\/(?:member|agent|staff|admin)\//u.test(file);
}

export function evaluatePortalLayoutTopology(root = process.cwd()) {
  const failures = [];

  for (const file of PORTAL_LAYOUTS) {
    if (!exists(root, file)) failures.push(`Missing canonical portal layout: ${file}`);
  }

  for (const file of REQUIRED_CANONICAL_PAGES) {
    if (!exists(root, file)) failures.push(`Missing canonical agent page: ${file}`);
  }

  for (const relativePath of FORBIDDEN_PATHS) {
    if (exists(root, relativePath))
      failures.push(`Forbidden route surface exists: ${relativePath}`);
  }

  const portalLayouts = walkFiles(root, ROUTE_ROOT)
    .filter(isPortalLayoutCandidate)
    .sort(comparePath);
  const expected = [...PORTAL_LAYOUTS].sort(comparePath);
  const unexpected = portalLayouts.filter(file => !expected.includes(file));
  const missing = expected.filter(file => !portalLayouts.includes(file));

  if (unexpected.length > 0) {
    failures.push(`Unexpected portal layout files: ${unexpected.join(', ')}`);
  }
  if (missing.length > 0) {
    failures.push(`Portal layout scan missed expected files: ${missing.join(', ')}`);
  }
  if (portalLayouts.length !== PORTAL_LAYOUTS.length) {
    failures.push(`Expected exactly 4 portal layouts, found ${portalLayouts.length}`);
  }

  const clientRouteLayouts = portalLayouts.filter(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8').trimStart();
    return source.startsWith("'use client'") || source.startsWith('"use client"');
  });
  if (clientRouteLayouts.length > 0) {
    failures.push(
      `Portal route layouts must remain server shells: ${clientRouteLayouts.join(', ')}`
    );
  }

  return { ok: failures.length === 0, portalLayouts, failures };
}

function main() {
  const result = evaluatePortalLayoutTopology();
  if (!result.ok) {
    console.error('Portal layout topology guard failed:');
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Portal layout topology guard passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
