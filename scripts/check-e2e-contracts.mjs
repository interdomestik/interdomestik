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

// Narrow strict targets for production smoke compliance.
const STRICT_TARGETS = new Set([
  'apps/web/e2e/production.spec.ts',
  // Optional scope: add smoke folder when ready.
  'apps/web/e2e/smoke/**',
]);

const ALLOWLIST_PATHS = new Set([
  // Contract tests may intentionally reference cross-locale paths.
  'apps/web/e2e/gate/tenant-resolution.spec.ts',
]);

const localeRules = [
  {
    id: 'no-default-locale-constant',
    description: 'Ban DEFAULT_LOCALE in E2E code (locale must come from project baseURL).',
    pattern: /\bDEFAULT_LOCALE\b/g,
  },
  {
    id: 'no-hardcoded-locale-prefix',
    description:
      'Ban hardcoded locale prefixes like "/sq"/"/mk"/"/en" in E2E paths (use routes/gotoApp helpers).',
    pattern: /(?:['"`](?:https?:\/\/[^'"`/\r\n]+)?|\$\{[^}\r\n]+\})\/(sq|mk|en)(\/|['"`?#])/g,
  },
];

const readinessRules = [
  {
    id: 'no-networkidle',
    description: "Ban waitForLoadState('networkidle') (use page-ready marker).",
    pattern: /waitForLoadState\(\s*['"]networkidle['"]\s*\)/g,
  },
];

function isStrictTarget(relPath) {
  if (STRICT_TARGETS.has(relPath)) return true;
  return Array.from(STRICT_TARGETS).some(
    target => target.endsWith('/**') && relPath.startsWith(target.slice(0, -3))
  );
}

function shouldEnforceLocaleOnFile(relPath) {
  return !ALLOWLIST_PATHS.has(relPath);
}

function shouldEnforceReadinessOnFile(relPath) {
  return isStrictTarget(relPath);
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

function enforceProductionSpecStrictness(relPath, content) {
  if (!STRICT_TARGETS.has(relPath)) return [];

  const violations = [];

  if (content.match(/\.waitForTimeout\s*\(/)) {
    violations.push(
      `${relPath}: page.waitForTimeout is forbidden; use readiness markers (data-testid).`
    );
  }

  if (content.match(/\bDEFAULT_LOCALE\b/)) {
    violations.push(
      `${relPath}: DEFAULT_LOCALE is forbidden; derive locale from testInfo via routes helpers.`
    );
  }

  if (content.match(/(['"`])\/(sq|mk|en)\//g)) {
    violations.push(`${relPath}: hardcoded locale-prefixed path detected; use routes.*(testInfo).`);
  }

  return violations;
}

async function main() {
  const files = await glob(E2E_GLOBS, { cwd: repoRoot, nodir: true });

  const violations = [];

  for (const relPath of files) {
    const absPath = path.join(repoRoot, relPath);
    const content = await readFile(absPath, 'utf8');

    if (isStrictTarget(relPath)) {
      const strictViolations = enforceProductionSpecStrictness(relPath, content);
      violations.push(...strictViolations);
    }

    const activeRules = [
      ...(shouldEnforceLocaleOnFile(relPath) ? localeRules : []),
      ...(shouldEnforceReadinessOnFile(relPath) ? readinessRules : []),
    ];

    for (const rule of activeRules) {
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
