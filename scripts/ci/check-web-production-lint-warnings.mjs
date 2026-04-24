#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const webRoot = path.join(repoRoot, 'apps/web');
const baselinePath = path.join(scriptDir, 'web-production-lint-warning-baseline.json');
const eslintBinPath = path.join(webRoot, 'node_modules/eslint/bin/eslint.js');

function normalizePathname(filePath) {
  return path.relative(webRoot, filePath).split(path.sep).join('/');
}

function isProductionSource(relPath) {
  if (!relPath.startsWith('src/')) return false;
  if (relPath.startsWith('src/test/')) return false;
  if (relPath.endsWith('.d.ts')) return false;
  if (/\.test\.(ts|tsx)$/.test(relPath)) return false;
  return /\.(ts|tsx)$/.test(relPath);
}

function runEslintJson() {
  const result = spawnSync(process.execPath, [eslintBinPath, 'src/**/*.{ts,tsx}', '--format', 'json'], {
    cwd: webRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !result.stdout.trim()) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

function summarizeWarnings(eslintResults) {
  const summary = {};

  for (const fileResult of eslintResults) {
    const relPath = normalizePathname(fileResult.filePath);
    if (!isProductionSource(relPath)) continue;

    for (const message of fileResult.messages) {
      if (message.severity !== 1) continue;
      const ruleId = message.ruleId ?? 'unknown';
      const key = `${relPath}#${ruleId}`;
      summary[key] = (summary[key] ?? 0) + 1;
    }
  }

  return Object.fromEntries(
    Object.entries(summary).sort(([left], [right]) => left.localeCompare(right))
  );
}

function collectErrors(eslintResults) {
  const errors = [];

  for (const fileResult of eslintResults) {
    const relPath = normalizePathname(fileResult.filePath);
    if (!isProductionSource(relPath)) continue;

    for (const message of fileResult.messages) {
      if (message.severity !== 2) continue;
      errors.push(
        `${relPath}:${message.line ?? 0}:${message.column ?? 0} ${message.ruleId ?? 'unknown'} ${
          message.message
        }`
      );
    }
  }

  return errors;
}

function total(summary) {
  return Object.values(summary).reduce((sum, count) => sum + count, 0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const eslintResults = runEslintJson();
const lintErrors = collectErrors(eslintResults);
const current = summarizeWarnings(eslintResults);
const allowedTotal = total(baseline.warnings);

if (lintErrors.length > 0) {
  console.error('Production lint errors found:');
  for (const lintError of lintErrors) {
    console.error(`- ${lintError}`);
  }
  process.exit(1);
}

if (baseline.totalWarnings !== allowedTotal) {
  console.error(
    `Production lint warning baseline metadata is stale: totalWarnings=${baseline.totalWarnings}, summed warnings=${allowedTotal}.`
  );
  process.exit(1);
}

const regressions = [];
for (const [key, count] of Object.entries(current)) {
  const allowed = baseline.warnings[key] ?? 0;
  if (count > allowed) {
    regressions.push({ key, count, allowed });
  }
}

if (regressions.length > 0) {
  console.error('Production lint warning baseline regressed:');
  for (const regression of regressions) {
    console.error(
      `- ${regression.key}: ${regression.count} warning(s), allowed ${regression.allowed}`
    );
  }
  console.error(
    '\nFix the new warning or intentionally update the baseline with reviewer approval.'
  );
  process.exit(1);
}

const staleBaselineEntries = Object.entries(baseline.warnings).filter(
  ([key, allowed]) => (current[key] ?? 0) < allowed
);

if (staleBaselineEntries.length > 0) {
  console.warn('Production lint warning baseline has stale entries that can be reduced:');
  for (const [key, allowed] of staleBaselineEntries) {
    console.warn(`- ${key}: ${current[key] ?? 0} current warning(s), baseline allows ${allowed}`);
  }
}

console.log(
  `Production lint warning baseline passed: ${total(current)} current warning(s), ${allowedTotal} allowed.`
);
