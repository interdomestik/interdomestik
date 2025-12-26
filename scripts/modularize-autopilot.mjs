#!/usr/bin/env node
/**
 * Modularize Autopilot
 *
 * Mechanical, low-judgement modularization to reduce coupling in entrypoints and
 * keep import paths stable.
 *
 * What it does:
 * - App Router entrypoints (page.tsx/layout.tsx/route.ts):
 *   - Moves the entire file content into sibling _core.(ts|tsx) (if missing)
 *   - Replaces entrypoint with a thin wrapper that re-exports from ./_core
 *   - Preserves 'use client' / 'use server' directive in the wrapper if present
 * - Large modules in apps/web/src/lib and apps/web/src/actions:
 *   - Moves the entire file into a sibling *.core.ts (if missing)
 *   - Replaces original with a thin re-export wrapper
 *   - Preserves 'use client' / 'use server' directive in the wrapper if present
 *
 * Safety:
 * - Default is dry-run. Use --apply to write changes.
 * - Skips if the target core file already exists.
 * - Skips test files and *.d.ts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();

function parseArgs(argv) {
  const args = {
    apply: false,
    batch: 25,
    appRoot: 'apps/web/src/app',
    moduleRoots: ['apps/web/src/lib', 'apps/web/src/actions'],
    minModuleLines: 200,
    includeEntrypoints: true,
    includeModules: true,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--apply') {
      args.apply = true;
    } else if (token === '--batch') {
      args.batch = Number(argv[i + 1] ?? '25');
      i++;
    } else if (token === '--min-module-lines') {
      args.minModuleLines = Number(argv[i + 1] ?? '200');
      i++;
    } else if (token === '--no-entrypoints') {
      args.includeEntrypoints = false;
    } else if (token === '--no-modules') {
      args.includeModules = false;
    } else if (token === '--json') {
      args.json = true;
    }
  }

  if (!Number.isFinite(args.batch) || args.batch < 1) args.batch = 25;
  if (!Number.isFinite(args.minModuleLines) || args.minModuleLines < 0) args.minModuleLines = 0;
  return args;
}

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
      const n = entry.name;
      if (
        n === 'node_modules' ||
        n === '.next' ||
        n === 'dist' ||
        n === 'build' ||
        n === 'coverage' ||
        n === 'test-results' ||
        n === 'playwright-report'
      ) {
        continue;
      }
      results.push(...(await walk(full)));
      continue;
    }
    results.push(full);
  }

  return results;
}

function lineCount(text) {
  return text.split(/\r?\n/u).length;
}

function isInterestingSourceFile(absPath) {
  const base = path.basename(absPath);
  if (!(base.endsWith('.ts') || base.endsWith('.tsx'))) return false;
  if (base.endsWith('.d.ts')) return false;
  if (base.includes('.test.')) return false;
  if (absPath.includes(`${path.sep}__tests__${path.sep}`)) return false;
  return true;
}

function detectDirective(text) {
  // Only consider very top of file.
  const head = text.split(/\r?\n/u).slice(0, 10).join('\n');
  if (/^\s*['"]use client['"];?/mu.test(head)) return 'use client';
  if (/^\s*['"]use server['"];?/mu.test(head)) return 'use server';
  return null;
}

function makeEntrypointWrapper({ directive, entryFileName, coreImport }) {
  const directiveLine = directive ? `'${directive}';\n` : '';
  // For page/layout, preserve default export.
  if (entryFileName === 'page.tsx' || entryFileName === 'layout.tsx') {
    return `${directiveLine}export { default } from '${coreImport}';\nexport * from '${coreImport}';\n`;
  }
  // For route.ts: re-export handlers and config.
  return `${directiveLine}export * from '${coreImport}';\n`;
}

function makeModuleWrapper({ directive, coreRelImport }) {
  const directiveLine = directive ? `'${directive}';\n` : '';
  return `${directiveLine}// Thin wrapper to keep import path stable while implementation lives in \`${coreRelImport}\`.\nexport * from '${coreRelImport}';\n`;
}

function hasDefaultExport(text) {
  // Very lightweight detection; we only need to preserve existing default exports.
  // Covers:
  // - export default ...
  // - export { default } from '...'
  // - export { default as X } from '...'
  return (
    /\bexport\s+default\b/u.test(text) ||
    /\bexport\s*\{[^}]*\bdefault\b[^}]*\}\s*from\b/u.test(text)
  );
}

async function modularizeEntrypoint({ absPath, apply }) {
  const entryFileName = path.basename(absPath);
  const dir = path.dirname(absPath);

  const original = await fs.readFile(absPath, 'utf8');
  if (/from\s+['"]\.\/_core(\.[^'"]+)?['"]/u.test(original)) {
    return { changed: false, reason: 'already_imports_core' };
  }

  // If a sibling _core exists already, assume this directory is already modularized
  // (or has an established convention) and skip to avoid collisions.
  const coreCandidates = [
    path.join(dir, '_core.ts'),
    path.join(dir, '_core.tsx'),
    path.join(dir, '_core.entry.tsx'),
  ];
  for (const c of coreCandidates) {
    if (await fileExists(c)) {
      return { changed: false, reason: 'core_exists' };
    }
  }

  const directive = detectDirective(original);
  const isJsxEntrypoint = entryFileName === 'page.tsx' || entryFileName === 'layout.tsx';
  const coreAbs = isJsxEntrypoint ? path.join(dir, '_core.entry.tsx') : path.join(dir, '_core.ts');
  const coreImport = isJsxEntrypoint ? './_core.entry' : './_core';

  const wrapper = makeEntrypointWrapper({ directive, entryFileName, coreImport });

  if (apply) {
    await fs.writeFile(coreAbs, original, 'utf8');
    await fs.writeFile(absPath, wrapper, 'utf8');
  }

  return {
    changed: true,
    kind: 'entrypoint',
    entryRel: toPosixRelative(absPath),
    coreRel: toPosixRelative(coreAbs),
  };
}

async function modularizeModuleFile({ absPath, apply, minLines }) {
  if (!isInterestingSourceFile(absPath)) {
    return { changed: false, reason: 'not_interesting' };
  }

  const original = await fs.readFile(absPath, 'utf8');
  if (lineCount(original) < minLines) {
    return { changed: false, reason: 'too_small' };
  }

  // Skip if already a wrapper.
  if (/export\s+\*\s+from\s+['"].*\.core['"]/u.test(original)) {
    return { changed: false, reason: 'already_wrapper' };
  }
  if (absPath.endsWith('.core.ts') || absPath.endsWith('.core.tsx')) {
    return { changed: false, reason: 'already_core' };
  }

  const directive = detectDirective(original);
  const hasDefault = hasDefaultExport(original);

  const ext = absPath.endsWith('.tsx') ? 'tsx' : 'ts';
  const baseNoExt = absPath.slice(0, -(ext.length + 1));
  const coreAbs = `${baseNoExt}.core.${ext}`;

  if (await fileExists(coreAbs)) {
    return { changed: false, reason: 'core_exists' };
  }

  const coreRelImport = `./${path.basename(coreAbs)}`.replace(/\.(ts|tsx)$/u, '');
  const wrapperDefaultLine = hasDefault ? `export { default } from '${coreRelImport}';\n` : '';
  const wrapper =
    `${directive ? `'${directive}';\n` : ''}` +
    `// Thin wrapper to keep import path stable while implementation lives in \`${coreRelImport}\`.\n` +
    wrapperDefaultLine +
    `export * from '${coreRelImport}';\n`;

  if (apply) {
    await fs.writeFile(coreAbs, original, 'utf8');
    await fs.writeFile(absPath, wrapper, 'utf8');
  }

  return {
    changed: true,
    kind: 'module',
    entryRel: toPosixRelative(absPath),
    coreRel: toPosixRelative(coreAbs),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const appRootAbs = path.join(repoRoot, args.appRoot);
  if (args.includeEntrypoints && !(await fileExists(appRootAbs))) {
    console.error(`App root not found: ${toPosixRelative(appRootAbs)}`);
    process.exit(2);
  }

  const changes = [];
  const considered = [];

  if (args.includeEntrypoints) {
    const files = await walk(appRootAbs);
    const entryFiles = files.filter(p => {
      const base = path.basename(p);
      return base === 'page.tsx' || base === 'layout.tsx' || base === 'route.ts';
    });

    for (const f of entryFiles) {
      if (changes.length >= args.batch) break;
      const res = await modularizeEntrypoint({ absPath: f, apply: args.apply });
      considered.push({ kind: 'entrypoint', relPath: toPosixRelative(f), result: res.reason });
      if (res.changed) changes.push(res);
    }
  }

  if (args.includeModules && changes.length < args.batch) {
    const remainingBudget = args.batch - changes.length;

    const rootsAbs = args.moduleRoots.map(r => path.join(repoRoot, r));
    for (const r of rootsAbs) {
      if (!(await fileExists(r))) continue;
      const files = (await walk(r)).filter(isInterestingSourceFile);

      for (const f of files) {
        if (changes.length >= args.batch) break;
        const res = await modularizeModuleFile({
          absPath: f,
          apply: args.apply,
          minLines: args.minModuleLines,
        });
        considered.push({ kind: 'module', relPath: toPosixRelative(f), result: res.reason });
        if (res.changed) changes.push(res);
      }
    }

    void remainingBudget;
  }

  const summary = {
    apply: args.apply,
    batch: args.batch,
    changedCount: changes.length,
    changed: changes,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`[modularize-autopilot] ${mode} changed=${changes.length} (batch=${args.batch})`);
  for (const c of changes) {
    console.log(`- ${c.kind}: ${c.entryRel} -> ${c.coreRel}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
