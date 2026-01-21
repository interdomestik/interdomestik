#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { glob } from 'glob';

const repoRoot = process.cwd();

const E2E_GLOBS = [
  'apps/web/e2e/**/*.{ts,tsx}',
  '!apps/web/e2e/**/node_modules/**',
  '!apps/web/e2e/**/test-results/**',
];

// Start strict where it matters most (fixtures/helpers). Expand scope as you migrate specs.
const ENFORCED_PREFIXES = ['apps/web/e2e/fixtures/', 'apps/web/e2e/routes.ts'];

const ALLOWLIST_PATHS = new Set([
  // Contract tests may intentionally reference cross-locale paths.
  'apps/web/e2e/gate/tenant-resolution.spec.ts',
]);

const rules = [
  {
    id: 'no-default-locale-constant',
    description: 'Ban DEFAULT_LOCALE in E2E code (locale must come from project baseURL).',
    pattern: /\bDEFAULT_LOCALE\b/g,
  },
  {
    id: 'no-networkidle',
    description: 'Ban waitForLoadState(\'networkidle\') (use page-ready marker).',
    pattern: /waitForLoadState\(\s*['"]networkidle['"]\s*\)/g,
  },
  {
    id: 'no-hardcoded-locale-prefix',
    description:
      'Ban hardcoded locale prefixes like "/sq"/"/mk"/"/en" in E2E helpers (use routes/fixtures helpers).',
    pattern: /['"]\/(sq|mk|en)(\/|['"])/g,
  },
];

function shouldEnforceOnFile(relPath) {
  if (ALLOWLIST_PATHS.has(relPath)) return false;
  return ENFORCED_PREFIXES.some(prefix => relPath.startsWith(prefix));
}

function formatHit(relPath, line, col, ruleId, excerpt) {
  return `${relPath}:${line}:${col}  ${ruleId}  ${excerpt.trim()}`;
}

function computeLineCol(text, index) {
  const upTo = text.slice(0, index);
  const lines = upTo.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}

async function main() {
  const files = await glob(E2E_GLOBS, { cwd: repoRoot, nodir: true });

  const violations = [];

  for (const relPath of files) {
    if (!shouldEnforceOnFile(relPath)) continue;

    const absPath = path.join(repoRoot, relPath);
    const content = await readFile(absPath, 'utf8');

    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(content))) {
        const { line, col } = computeLineCol(content, match.index);
        const excerpt = content.split('\n')[line - 1] ?? '';
        violations.push(formatHit(relPath, line, col, rule.id, excerpt));
      }
    }
  }

  if (violations.length > 0) {
    console.error('E2E contract violations found:\n');
    for (const v of violations) console.error(v);
    console.error(
      `\nFix by using apps/web/e2e/fixtures/routes.ts helpers + the universal page-ready marker.\n`
    );
    process.exit(1);
  }

  console.log('E2E contract check passed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
