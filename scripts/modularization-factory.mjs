#!/usr/bin/env node
/**
 * Modularization Factory
 *
 * Scans Next.js App Router entrypoints under apps/web/src/app, ranks them by “fatness”,
 * and can scaffold adjacent _core.ts + _core.test.ts files.
 *
 * Goals:
 * - Speed up modularization by standardizing the first 70% of work.
 * - Keep it safe: scaffolding does NOT modify existing entrypoints by default.
 *
 * Usage:
 *   node scripts/modularization-factory.mjs --top 30
 *   node scripts/modularization-factory.mjs --top 15 --json
 *   node scripts/modularization-factory.mjs --top 10 --scaffold
 *   node scripts/modularization-factory.mjs --only "admin/users" --scaffold
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const APP_ROOT = path.join(repoRoot, 'apps/web/src/app');

function parseArgs(argv) {
  const args = {
    top: 30,
    json: false,
    scaffold: false,
    only: null,
    needsCore: false,
    dataOnly: false,
    include: ['page.tsx', 'route.ts'],
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--top') {
      args.top = Number(argv[i + 1] ?? '30');
      i++;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--scaffold') {
      args.scaffold = true;
    } else if (token === '--only') {
      args.only = String(argv[i + 1] ?? '');
      i++;
    } else if (token === '--needs-core') {
      args.needsCore = true;
    } else if (token === '--data-only') {
      args.dataOnly = true;
    } else if (token === '--include') {
      // comma-separated list
      const raw = String(argv[i + 1] ?? '');
      args.include = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      i++;
    }
  }

  if (!Number.isFinite(args.top) || args.top <= 0) args.top = 30;
  return args;
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
      // Skip build artifacts / tests output just in case
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      results.push(...(await walk(full)));
      continue;
    }

    results.push(full);
  }

  return results;
}

function scoreEntry({ lineCount, signals }) {
  // A simple scoring model: line count + weighted “server/data complexity” signals.
  let score = lineCount;
  if (signals.importsDb) score += 300;
  if (signals.importsSchemaOrOrm) score += 150;
  if (signals.callsNotFound) score += 50;
  if (signals.usesNextServer) score += 50;
  if (signals.manyAwait) score += 50;
  return score;
}

function detectSignals(text) {
  const importsDb = /from\s+['"]@interdomestik\/database\/db['"]/u.test(text);
  const importsSchemaOrOrm =
    /@interdomestik\/database\/schema/u.test(text) || /from\s+['"]drizzle-orm['"]/u.test(text);
  const importsLocalCore = /from\s+['"]\.\/_core['"]/u.test(text);
  const callsNotFound = /\bnotFound\(/u.test(text);
  const usesNextServer =
    /next\/navigation/u.test(text) ||
    /next-intl\/server/u.test(text) ||
    /next\/headers/u.test(text);
  const awaitCount = (text.match(/\bawait\b/gu) ?? []).length;
  const manyAwait = awaitCount >= 8;

  return {
    importsDb,
    importsSchemaOrOrm,
    importsLocalCore,
    callsNotFound,
    usesNextServer,
    manyAwait,
    awaitCount,
  };
}

function toPosixRelative(filePath) {
  const rel = path.relative(repoRoot, filePath);
  return rel.split(path.sep).join('/');
}

function scaffoldTemplates({ entryType, dirRel, baseName }) {
  // baseName: e.g. 'page.tsx'
  // dirRel: path relative to repo root
  const coreFile = path.join(repoRoot, dirRel, '_core.ts');
  const coreTestFile = path.join(repoRoot, dirRel, '_core.test.ts');

  if (entryType === 'page') {
    return {
      coreFile,
      coreTestFile,
      coreContent: `import { db } from '@interdomestik/database/db';\n\nexport type PageCoreNotFound = { kind: 'not_found' };\nexport type PageCoreOk<TData> = { kind: 'ok'; data: TData };\nexport type PageCoreResult<TData> = PageCoreNotFound | PageCoreOk<TData>;\n\nexport async function loadPageCore(_args: unknown): Promise<PageCoreResult<unknown>> {\n  // TODO: Move DB reads + business logic from ${baseName} into here.\n  // Keep inputs explicit; avoid request-context dependencies (headers/cookies) where possible.\n  void db;\n  return { kind: 'ok', data: {} };\n}\n`,
      testContent: `import { describe, it, expect } from 'vitest';\n\nimport { loadPageCore } from './_core';\n\ndescribe('loadPageCore (scaffold)', () => {\n  it.todo('extract logic from entrypoint and test branching');\n\n  it('exports a function', () => {\n    expect(typeof loadPageCore).toBe('function');\n  });\n});\n`,
    };
  }

  // route
  return {
    coreFile,
    coreTestFile,
    coreContent: `import { db } from '@interdomestik/database/db';\n\nexport type RouteCoreResult = Response;\n\nexport async function handleRouteCore(_args: unknown): Promise<RouteCoreResult> {\n  // TODO: Move validation + DB logic from ${baseName} into here.\n  void db;\n  return new Response(JSON.stringify({ ok: true }), {\n    status: 200,\n    headers: { 'content-type': 'application/json' },\n  });\n}\n`,
    testContent: `import { describe, it, expect } from 'vitest';\n\nimport { handleRouteCore } from './_core';\n\ndescribe('handleRouteCore (scaffold)', () => {\n  it.todo('extract handler logic from entrypoint and add behavioral tests');\n\n  it('returns a Response', async () => {\n    const res = await handleRouteCore({});\n    expect(res).toBeInstanceOf(Response);\n  });\n});\n`,
  };
}

async function scaffoldCoreFiles(entry) {
  const dirAbs = path.dirname(entry.absPath);
  const dirRel = toPosixRelative(dirAbs);
  const entryType = entry.fileName === 'page.tsx' ? 'page' : 'route';

  const { coreFile, coreTestFile, coreContent, testContent } = scaffoldTemplates({
    entryType,
    dirRel,
    baseName: entry.fileName,
  });

  const created = [];

  if (!(await fileExists(coreFile))) {
    await fs.writeFile(coreFile, coreContent, 'utf8');
    created.push(toPosixRelative(coreFile));
  }

  if (!(await fileExists(coreTestFile))) {
    await fs.writeFile(coreTestFile, testContent, 'utf8');
    created.push(toPosixRelative(coreTestFile));
  }

  return created;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!(await fileExists(APP_ROOT))) {
    console.error(`Could not find ${toPosixRelative(APP_ROOT)}. Run from repo root.`);
    process.exit(2);
  }

  const allFiles = await walk(APP_ROOT);
  const entrypoints = allFiles
    .filter(p => args.include.includes(path.basename(p)))
    .map(p => ({ absPath: p, relPath: toPosixRelative(p), fileName: path.basename(p) }));

  const filtered = args.only
    ? entrypoints.filter(e => e.relPath.includes(String(args.only)))
    : entrypoints;

  const analyzed = [];
  for (const entry of filtered) {
    const text = await fs.readFile(entry.absPath, 'utf8');
    const lineCount = text.split(/\r?\n/u).length;
    const signals = detectSignals(text);

    const dirAbs = path.dirname(entry.absPath);
    const coreAbs = path.join(dirAbs, '_core.ts');
    const hasCore = await fileExists(coreAbs);

    if (args.needsCore && hasCore) {
      continue;
    }

    if (args.dataOnly) {
      const looksDataHeavy =
        signals.importsDb ||
        signals.importsSchemaOrOrm ||
        signals.callsNotFound ||
        signals.manyAwait;
      // If it already imports local core, it's probably already modularized.
      if (!looksDataHeavy || signals.importsLocalCore) {
        continue;
      }
    }

    analyzed.push({
      ...entry,
      lineCount,
      signals,
      hasCore,
      score: scoreEntry({ lineCount, signals }),
    });
  }

  analyzed.sort((a, b) => b.score - a.score);
  const top = analyzed.slice(0, args.top);

  if (args.scaffold) {
    const scaffolded = [];
    for (const entry of top) {
      scaffolded.push({
        relPath: entry.relPath,
        created: await scaffoldCoreFiles(entry),
      });
    }

    if (args.json) {
      console.log(JSON.stringify({ top, scaffolded }, null, 2));
      return;
    }

    for (const entry of top) {
      const created = scaffolded.find(s => s.relPath === entry.relPath)?.created ?? [];
      const createdText = created.length
        ? ` created: ${created.join(', ')}`
        : ' (already scaffolded)';
      console.log(
        `${entry.score.toString().padStart(5)}  ${entry.relPath}  [${entry.lineCount} lines]${createdText}`
      );
    }

    return;
  }

  if (args.json) {
    console.log(JSON.stringify({ top }, null, 2));
    return;
  }

  for (const entry of top) {
    const s = entry.signals;
    const flags = [
      s.importsDb ? 'db' : null,
      s.importsSchemaOrOrm ? 'orm' : null,
      s.importsLocalCore ? 'core' : null,
      s.callsNotFound ? 'notFound' : null,
      s.usesNextServer ? 'next-server' : null,
      s.manyAwait ? `await:${s.awaitCount}` : null,
      entry.hasCore ? 'has:_core' : 'no:_core',
    ]
      .filter(Boolean)
      .join(',');

    console.log(
      `${entry.score.toString().padStart(5)}  ${entry.relPath}  [${entry.lineCount} lines]${flags ? ` (${flags})` : ''}`
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
