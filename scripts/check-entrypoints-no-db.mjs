#!/usr/bin/env node
/**
 * Entrypoint guard: warn if Next.js entrypoints import DB directly.
 *
 * Strategy:
 * - Prefer moving DB usage to sibling _core.ts modules.
 * - Keep this warning-only by default so it can be adopted incrementally.
 *
 * Usage:
 *   node scripts/check-entrypoints-no-db.mjs
 *   node scripts/check-entrypoints-no-db.mjs --strict
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const APP_ROOT = path.join(repoRoot, 'apps/web/src/app');

function toPosixRelative(filePath) {
  const rel = path.relative(repoRoot, filePath);
  return rel.split(path.sep).join('/');
}

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      results.push(...(await walk(full)));
      continue;
    }
    results.push(full);
  }

  return results;
}

function parseArgs(argv) {
  return {
    strict: argv.includes('--strict'),
  };
}

function hasDirectDbImport(text) {
  return (
    /from\s+['"]@interdomestik\/database\/db['"]/u.test(text) ||
    /from\s+['"]@interdomestik\/database\/schema['"]/u.test(text)
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!(await fileExists(APP_ROOT))) {
    console.error('apps/web/src/app not found; run from repo root');
    process.exit(2);
  }

  const files = await walk(APP_ROOT);
  const entryFiles = files.filter(p => {
    const base = path.basename(p);
    return base === 'page.tsx' || base === 'route.ts' || base === 'layout.tsx';
  });

  const violations = [];

  for (const file of entryFiles) {
    const text = await fs.readFile(file, 'utf8');

    // Allow core modules to import DB.
    if (file.endsWith('/_core.ts')) continue;

    if (hasDirectDbImport(text)) {
      violations.push(toPosixRelative(file));
    }
  }

  if (violations.length === 0) {
    console.log('OK: no direct DB imports found in entrypoints');
    return;
  }

  console.log('Entrypoints importing DB directly (prefer sibling _core.ts):');
  for (const v of violations) console.log(`- ${v}`);

  if (args.strict) {
    process.exit(1);
  }

  // warning-only default
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
