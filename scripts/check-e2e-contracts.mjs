#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { glob } from 'glob';
import ts from 'typescript';

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

const PLAYWRIGHT_CONFIG_PATH = 'apps/web/playwright.config.ts';
const UPLOAD_CROSS_TENANT_SPEC = 'security/upload-cross-tenant.spec.ts';
const SECURITY_GATE_CONSUMERS = [
  'GATE_KS_TEST_MATCH',
  'GATE_MK_TEST_MATCH',
  'GATE_AL_TEST_MATCH',
  'GATE_MK_CONTRACT_MATCH',
];
const SECURITY_GATE_PROJECT_MATCHES = new Map([
  ['gate-ks-sq', 'GATE_KS_TEST_MATCH'],
  ['gate-mk-mk', 'GATE_MK_TEST_MATCH'],
  ['gate-al-sq', 'GATE_AL_TEST_MATCH'],
  ['gate-mk-contract', 'GATE_MK_CONTRACT_MATCH'],
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

function propertyNameText(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function getObjectProperty(objectLiteral, propertyName) {
  return objectLiteral.properties.find(
    property =>
      ts.isPropertyAssignment(property) && propertyNameText(property.name) === propertyName
  );
}

function getConstInitializer(sourceFile, constName) {
  let initializer = null;

  function visit(node) {
    if (initializer) return;
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === constName) {
          initializer = declaration.initializer ?? null;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!initializer) {
    throw new Error(`${PLAYWRIGHT_CONFIG_PATH}: missing ${constName} declaration`);
  }

  return initializer;
}

function unwrapExpression(node) {
  if (ts.isParenthesizedExpression(node)) return unwrapExpression(node.expression);
  return node;
}

function arrayLiteralIncludesString(initializer, expectedValue) {
  const expression = unwrapExpression(initializer);
  return (
    ts.isArrayLiteralExpression(expression) &&
    expression.elements.some(
      element => ts.isStringLiteral(element) && element.text === expectedValue
    )
  );
}

function matchListAlwaysIncludesSecuritySpread(initializer) {
  const expression = unwrapExpression(initializer);

  if (ts.isConditionalExpression(expression)) {
    return (
      matchListAlwaysIncludesSecuritySpread(expression.whenTrue) &&
      matchListAlwaysIncludesSecuritySpread(expression.whenFalse)
    );
  }

  return (
    ts.isArrayLiteralExpression(expression) &&
    expression.elements.some(
      element =>
        ts.isSpreadElement(element) &&
        ts.isIdentifier(element.expression) &&
        element.expression.text === 'GATE_SECURITY_MATCH'
    )
  );
}

function findProjectsArray(sourceFile) {
  let projectsArray = null;

  function visit(node) {
    if (projectsArray) return;
    if (ts.isObjectLiteralExpression(node)) {
      const projects = getObjectProperty(node, 'projects');
      if (projects && ts.isArrayLiteralExpression(unwrapExpression(projects.initializer))) {
        projectsArray = unwrapExpression(projects.initializer);
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!projectsArray) {
    throw new Error(`${PLAYWRIGHT_CONFIG_PATH}: missing Playwright projects array`);
  }

  return projectsArray;
}

function collectProjectTestMatches(sourceFile) {
  const projectsArray = findProjectsArray(sourceFile);
  const projectMatches = new Map();

  for (const element of projectsArray.elements) {
    const project = unwrapExpression(element);
    if (!ts.isObjectLiteralExpression(project)) continue;

    const name = getObjectProperty(project, 'name');
    const testMatch = getObjectProperty(project, 'testMatch');
    if (!name || !testMatch || !ts.isStringLiteralLike(name.initializer)) continue;

    projectMatches.set(name.initializer.text, testMatch.initializer);
  }

  return projectMatches;
}

function enforceSecurityGateWiring(playwrightConfig) {
  const violations = [];
  const sourceFile = ts.createSourceFile(
    PLAYWRIGHT_CONFIG_PATH,
    playwrightConfig,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const securityMatch = getConstInitializer(sourceFile, 'GATE_SECURITY_MATCH');

  if (!arrayLiteralIncludesString(securityMatch, UPLOAD_CROSS_TENANT_SPEC)) {
    violations.push(
      `${PLAYWRIGHT_CONFIG_PATH}: GATE_SECURITY_MATCH must include '${UPLOAD_CROSS_TENANT_SPEC}'.`
    );
  }

  for (const consumer of SECURITY_GATE_CONSUMERS) {
    const initializer = getConstInitializer(sourceFile, consumer);
    if (!matchListAlwaysIncludesSecuritySpread(initializer)) {
      violations.push(`${PLAYWRIGHT_CONFIG_PATH}: ${consumer} must include GATE_SECURITY_MATCH.`);
    }
  }

  const projectMatches = collectProjectTestMatches(sourceFile);
  for (const [projectName, expectedMatch] of SECURITY_GATE_PROJECT_MATCHES) {
    const actualMatch = projectMatches.get(projectName);
    if (!actualMatch) {
      violations.push(`${PLAYWRIGHT_CONFIG_PATH}: missing ${projectName} project testMatch.`);
      continue;
    }

    if (!ts.isIdentifier(actualMatch) || actualMatch.text !== expectedMatch) {
      violations.push(
        `${PLAYWRIGHT_CONFIG_PATH}: ${projectName} testMatch must use ${expectedMatch}.`
      );
    }
  }

  return violations;
}

async function main() {
  const files = await glob(E2E_GLOBS, { cwd: repoRoot, nodir: true });

  const violations = [];
  const playwrightConfig = await readFile(path.join(repoRoot, PLAYWRIGHT_CONFIG_PATH), 'utf8');
  violations.push(...enforceSecurityGateWiring(playwrightConfig));

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
