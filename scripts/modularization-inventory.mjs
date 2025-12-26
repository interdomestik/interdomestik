#!/usr/bin/env node
/**
 * Modularization Inventory
 *
 * Finds and ranks large TS/TSX modules likely to benefit from modularization,
 * beyond Next.js entrypoints (e.g., actions/, lib/).
 *
 * Usage:
 *   node scripts/modularization-inventory.mjs
 *   node scripts/modularization-inventory.mjs --top 50 --min-lines 120
 *   node scripts/modularization-inventory.mjs --roots "apps/web/src/actions,apps/web/src/lib"
 *   node scripts/modularization-inventory.mjs --json
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();

function parseArgs(argv) {
  const args = {
    top: 40,
    minLines: 120,
    json: false,
    roots: ['apps/web/src/actions', 'apps/web/src/lib'],
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--top') {
      args.top = Number(argv[i + 1] ?? '40');
      i++;
    } else if (token === '--min-lines') {
      args.minLines = Number(argv[i + 1] ?? '120');
      i++;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--roots') {
      const raw = String(argv[i + 1] ?? '');
      args.roots = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      i++;
    }
  }

  if (!Number.isFinite(args.top) || args.top <= 0) args.top = 40;
  if (!Number.isFinite(args.minLines) || args.minLines < 0) args.minLines = 0;
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

function detectSignals(text) {
  const importsDb = /from\s+['"]@interdomestik\/database\/db['"]/u.test(text);
  const importsSchema = /@interdomestik\/database\/schema/u.test(text);
  const importsOrm = /from\s+['"]drizzle-orm['"]/u.test(text);
  const importsNextServer =
    /next\/headers/u.test(text) ||
    /next\/navigation/u.test(text) ||
    /next-intl\/server/u.test(text);

  const awaitCount = (text.match(/\bawait\b/gu) ?? []).length;
  const manyAwait = awaitCount >= 10;

  const exportsMany = (text.match(/\bexport\b/gu) ?? []).length >= 15;

  return {
    importsDb,
    importsSchema,
    importsOrm,
    importsNextServer,
    awaitCount,
    manyAwait,
    exportsMany,
  };
}

function scoreModule({ lineCount, signals }) {
  let score = lineCount;
  if (signals.importsDb) score += 400;
  if (signals.importsSchema) score += 200;
  if (signals.importsOrm) score += 100;
  if (signals.importsNextServer) score += 80;
  if (signals.manyAwait) score += 60;
  if (signals.exportsMany) score += 40;
  return score;
}

function isInterestingSourceFile(filePath) {
  const base = path.basename(filePath);
  if (!(base.endsWith('.ts') || base.endsWith('.tsx'))) return false;
  if (base.endsWith('.d.ts')) return false;
  if (base.includes('.test.')) return false;
  if (filePath.includes(`${path.sep}__tests__${path.sep}`)) return false;
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const rootsAbs = args.roots.map(r => path.join(repoRoot, r));
  for (const r of rootsAbs) {
    if (!(await fileExists(r))) {
      console.error(`Root not found: ${toPosixRelative(r)} (use --roots to adjust)`);
      process.exit(2);
    }
  }

  const files = [];
  for (const root of rootsAbs) {
    const walked = await walk(root);
    for (const f of walked) {
      if (isInterestingSourceFile(f)) files.push(f);
    }
  }

  const analyzed = [];
  for (const f of files) {
    const text = await fs.readFile(f, 'utf8');
    const lineCount = text.split(/\r?\n/u).length;
    if (lineCount < args.minLines) continue;

    const signals = detectSignals(text);
    analyzed.push({
      relPath: toPosixRelative(f),
      lineCount,
      signals,
      score: scoreModule({ lineCount, signals }),
    });
  }

  analyzed.sort((a, b) => b.score - a.score);
  const top = analyzed.slice(0, args.top);

  if (args.json) {
    console.log(JSON.stringify({ top }, null, 2));
    return;
  }

  for (const m of top) {
    const s = m.signals;
    const flags = [
      s.importsDb ? 'db' : null,
      s.importsSchema ? 'schema' : null,
      s.importsOrm ? 'orm' : null,
      s.importsNextServer ? 'next-server' : null,
      s.manyAwait ? `await:${s.awaitCount}` : null,
      s.exportsMany ? 'many-exports' : null,
    ]
      .filter(Boolean)
      .join(',');

    console.log(
      `${m.score.toString().padStart(5)}  ${m.relPath}  [${m.lineCount} lines]${flags ? ` (${flags})` : ''}`
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
