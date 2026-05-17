#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceRoots = ['apps/web/src', 'packages', 'scripts'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const excludedPathParts = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'test-results',
]);

const deprecatedCrmAdapterImport = ['@', 'lib', 'domain-crm'].join('/');
const deprecatedCrmAdapterPath = ['apps', 'web', 'src', 'lib', 'domain-crm'].join('/');
const deprecatedCrmAdapterShortPath = ['src', 'lib', 'domain-crm'].join('/');
const crmAdapterPath = ['apps', 'web', 'src', 'adapters', 'crm'].join('/');
const legacyCoreAllowlistPath = 'scripts/ci/core-module-legacy-allowlist.json';
const legacyRouteAllowlistPath = 'scripts/ci/legacy-route-allowlist.json';
const deprecatedCrmAdapterPatterns = [
  deprecatedCrmAdapterImport,
  deprecatedCrmAdapterPath,
  deprecatedCrmAdapterShortPath,
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walkFiles(root, results = []) {
  if (!fs.existsSync(root)) return results;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (excludedPathParts.has(entry.name)) continue;

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

function findDeprecatedCrmAdapterReferences() {
  const matches = [];
  const files = sourceRoots.flatMap(root => walkFiles(path.join(repoRoot, root)));

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const relativePath = toPosix(path.relative(repoRoot, file));
    if (relativePath === 'scripts/check-architecture-boundaries.mjs') continue;

    for (const pattern of deprecatedCrmAdapterPatterns) {
      if (source.includes(pattern)) {
        matches.push({ file: relativePath, pattern });
      }
    }
  }

  return matches;
}

function findUnexpectedUnderscoreCoreFiles() {
  const allowlistFile = path.join(repoRoot, legacyCoreAllowlistPath);
  const allowlist = new Set(
    JSON.parse(fs.readFileSync(allowlistFile, 'utf8')).allowedUnderscoreCoreFiles ?? []
  );
  const files = sourceRoots
    .flatMap(root => walkFiles(path.join(repoRoot, root)))
    .map(file => toPosix(path.relative(repoRoot, file)))
    .filter(relativePath => /(^|\/)_core\.[cm]?[jt]sx?$/u.test(relativePath));

  return files.filter(file => !allowlist.has(file));
}

function findUnexpectedLegacyRouteFiles() {
  const allowlistFile = path.join(repoRoot, legacyRouteAllowlistPath);
  const allowlist = new Set(
    JSON.parse(fs.readFileSync(allowlistFile, 'utf8')).allowedLegacyRouteFiles ?? []
  );
  const files = walkFiles(path.join(repoRoot, 'apps/web/src/app/[locale]/legacy')).map(file =>
    toPosix(path.relative(repoRoot, file))
  );

  return files.filter(file => !allowlist.has(file));
}

function main() {
  const deprecatedCrmAdapterDir = path.join(repoRoot, ...deprecatedCrmAdapterPath.split('/'));
  const crmAdapterDir = path.join(repoRoot, ...crmAdapterPath.split('/'));
  const failures = [];

  if (fs.existsSync(deprecatedCrmAdapterDir)) {
    failures.push(
      `${deprecatedCrmAdapterPath} must not exist; CRM DB adapters live in ${crmAdapterPath}.`
    );
  }

  if (!fs.existsSync(crmAdapterDir)) {
    failures.push(
      `${crmAdapterPath} is missing; CRM DB adapters need an explicit adapter boundary.`
    );
  }

  const deprecatedReferences = findDeprecatedCrmAdapterReferences();
  for (const match of deprecatedReferences) {
    failures.push(`${match.file} references deprecated CRM adapter boundary "${match.pattern}".`);
  }

  const unexpectedUnderscoreCoreFiles = findUnexpectedUnderscoreCoreFiles();
  for (const file of unexpectedUnderscoreCoreFiles) {
    failures.push(
      `${file} uses the legacy _core.ts naming convention; new extracted cores must use *.core.ts.`
    );
  }

  const unexpectedLegacyRouteFiles = findUnexpectedLegacyRouteFiles();
  for (const file of unexpectedLegacyRouteFiles) {
    failures.push(
      `${file} extends the frozen legacy route surface; use canonical /member, /agent, /staff, or /admin routes.`
    );
  }

  if (failures.length > 0) {
    console.error('Architecture boundary guard failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Architecture boundary guard passed.');
}

main();
