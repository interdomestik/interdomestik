#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  callSiteWindow,
  commentText,
  findClosingParen,
  lineNumberForIndex,
  splitTopLevelArgs,
  stripCommentsAndStrings,
} from './ci/tenant-cache-parser.mjs';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SHARED_CACHE_KINDS = new Set([
  'airline-registry',
  'locale-messages',
  'plan-catalogs',
  'rule-packs',
]);
const PROTECTED_ROUTE_ROLES = new Set('member agent staff admin'.split(' '));

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walkFiles(root, files = []) {
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist', 'coverage'].includes(entry.name)) {
        walkFiles(fullPath, files);
      }
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function routeRole(relativePath) {
  if (!relativePath.startsWith('apps/web/src/app/')) return null;
  const segments = new Set(relativePath.split('/'));
  for (const role of PROTECTED_ROUTE_ROLES) {
    if (segments.has(role)) return role;
  }
  return null;
}

function sharedCacheKind(source) {
  const match = /tenant-cache-guard:\s*shared-cache\s+([a-z-]+)/u.exec(commentText(source));
  return match?.[1] ?? null;
}

function validateSharedCache(source, file, line, violations) {
  const kind = sharedCacheKind(source);
  if (kind && SHARED_CACHE_KINDS.has(kind)) return true;
  if (kind) violations.push(`${file}:${line} shared cache kind is not allowlisted: ${kind}`);
  return false;
}

function keySetHas(keyText, keyName) {
  return [`'${keyName}'`, `"${keyName}"`, `\`${keyName}\``].some(marker =>
    keyText.includes(marker)
  );
}

function codeHasTenantIdentifier(codeText, keyName) {
  const camelName = keyName.replace(/_([a-z])/gu, (_, letter) => letter.toUpperCase());
  return new RegExp(String.raw`\b(?:${keyName}|${camelName})\b`, 'u').test(codeText);
}

function inspectUnstableCache(source, file, role, violations) {
  const pattern = /\bunstable_cache\s*\(/gu;
  for (const match of source.matchAll(pattern)) {
    const openIndex = source.indexOf('(', match.index);
    const end = findClosingParen(source, openIndex);
    const line = lineNumberForIndex(source, match.index);
    if (end === -1) {
      violations.push(`${file}:${line} unstable_cache call is not parseable`);
      continue;
    }
    if (validateSharedCache(callSiteWindow(source, match.index, end + 1), file, line, violations))
      continue;
    const args = splitTopLevelArgs(source.slice(openIndex + 1, end));
    const keyText = args[1] ?? '';
    if (!keySetHas(keyText, 'access_tenant_id')) {
      violations.push(`${file}:${line} unstable_cache key set must include access_tenant_id`);
    }
    if (role === 'member' && !keySetHas(keyText, 'member_id')) {
      violations.push(`${file}:${line} member unstable_cache key set must include member_id`);
    }
  }
}

function inspectUseCache(source, file, role, violations) {
  const pattern = /['"]use cache['"]/gu;
  const codeText = stripCommentsAndStrings(source);
  for (const match of source.matchAll(pattern)) {
    const line = lineNumberForIndex(source, match.index);
    if (
      validateSharedCache(
        callSiteWindow(source, match.index, match.index + match[0].length),
        file,
        line,
        violations
      )
    )
      continue;
    if (!codeHasTenantIdentifier(codeText, 'access_tenant_id')) {
      violations.push(`${file}:${line} use cache file must declare access_tenant_id in key set`);
    }
    if (role === 'member' && !codeHasTenantIdentifier(codeText, 'member_id')) {
      violations.push(`${file}:${line} member use cache file must declare member_id in key set`);
    }
  }
}

export function findTenantCacheGuardViolations(root = process.cwd()) {
  const violations = [];
  for (const filePath of walkFiles(path.join(root, 'apps/web/src/app'))) {
    const relativePath = toPosix(path.relative(root, filePath));
    const role = routeRole(relativePath);
    if (!role) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    inspectUnstableCache(source, relativePath, role, violations);
    inspectUseCache(source, relativePath, role, violations);
  }
  return violations;
}

export function runTenantCacheGuard(root = process.cwd()) {
  const violations = findTenantCacheGuardViolations(root);
  if (violations.length > 0) {
    console.error('Tenant cache guard failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    return 1;
  }
  console.log('Tenant cache guard passed.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runTenantCacheGuard());
}
