#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceRoots = ['apps/web/src', 'packages'];
const sourceExtensions = new Set(['.ts', '.tsx']);
const excluded = new Set(['.git', '.next', '.turbo', 'build', 'coverage', 'dist', 'node_modules']);
const allowedResolveTenantFromHostImports = new Set([
  'apps/web/src/lib/tenant/tenant-hosts.test.ts',
  'apps/web/src/lib/tenant/tenant-host-security.test.ts',
  'apps/web/src/app/api/claims/evidence-upload/_core.ts',
  'apps/web/src/app/api/register/route.ts',
  'apps/web/src/app/[locale]/components/home/home-page-runtime.tsx',
  'apps/web/src/features/admin/claims/actions/evidence-upload.ts',
  'apps/web/src/features/admin/claims/server/getOpsClaimDetail.ts',
]);
const allowedCountryHostAliasImports = new Set([
  'apps/web/src/lib/tenant/tenant-hosts.ts',
  'apps/web/src/lib/tenant/tenant-front-door.ts',
  'apps/web/src/lib/tenant/tenant-host-aliases.test.ts',
]);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walk(root, results = []) {
  if (!fs.existsSync(root)) return results;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, results);
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) results.push(fullPath);
  }

  return results;
}

function importsResolveTenantFromHost(source) {
  const namedImport =
    /import\s*\{[^}]*\bresolveTenantFromHost\b[^}]*\}\s*from\s*['"][^'"]*tenant-hosts['"]/su;
  const namespaceImport =
    /import\s+\*\s+as\s+\w+\s+from\s*['"][^'"]*tenant-hosts['"]/su;
  const namespaceUse = /(?:\.resolveTenantFromHost\b|\[['"]resolveTenantFromHost['"]\])/u;
  return namedImport.test(source) || (namespaceImport.test(source) && namespaceUse.test(source));
}

function importsCountryHostAliasResolver(source) {
  const namedImport =
    /import\s*\{[^}]*\bresolveCountryHostCompatibilityAlias\b[^}]*\}\s*from\s*['"][^'"]*tenant-host-aliases['"]/su;
  const namespaceImport =
    /import\s+\*\s+as\s+\w+\s+from\s*['"][^'"]*tenant-host-aliases['"]/su;
  const namespaceUse =
    /(?:\.resolveCountryHostCompatibilityAlias\b|\[['"]resolveCountryHostCompatibilityAlias['"]\])/u;
  return (
    namedImport.test(source) ||
    (namespaceImport.test(source) && namespaceUse.test(source))
  );
}

const failures = [];
const files = sourceRoots.flatMap(root => walk(path.join(repoRoot, root)));

for (const file of files) {
  const relativePath = toPosix(path.relative(repoRoot, file));
  const source = fs.readFileSync(file, 'utf8');

  if (
    importsResolveTenantFromHost(source) &&
    !allowedResolveTenantFromHostImports.has(relativePath)
  ) {
    failures.push(
      `${relativePath} imports resolveTenantFromHost; use explicit session/app tenant context and keep country hosts as compatibility aliases/default-booking hints.`
    );
  }

  if (
    importsCountryHostAliasResolver(source) &&
    !allowedCountryHostAliasImports.has(relativePath)
  ) {
    failures.push(
      `${relativePath} imports resolveCountryHostCompatibilityAlias; use the tenant context boundary instead of adding direct host-as-tenant branches.`
    );
  }
}

if (failures.length > 0) {
  console.error('Country host alias guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Country host alias guard passed.');
