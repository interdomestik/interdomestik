#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { glob } from 'glob';
import ts from 'typescript';

const args = new Map(
  process.argv.slice(2).flatMap(arg => {
    const match = arg.match(/^--([^=]+)=(.*)$/u);
    return match ? [[match[1], match[2]]] : [];
  })
);

const repoRoot = path.resolve(args.get('repo-root') ?? process.cwd());
const playwrightConfigPath = args.get('playwright-config') ?? 'apps/web/playwright.config.ts';
const e2eRoot = args.get('e2e-root') ?? 'apps/web/e2e';
const printInventory = process.argv.includes('--inventory');

const TENANT_HOST_PROJECTS = new Map([
  ['gate-ks-sq', 'legacy KS gate lane; country host alias until ida/session-context lanes exist'],
  ['gate-mk-mk', 'legacy MK gate lane; country host alias until ida/session-context lanes exist'],
  ['gate-mk-contract', 'MK contract lane proving host-scoped regressions'],
  ['gate-al-sq', 'AL alias/security lane'],
  ['crm-visual-ks-sq', 'opt-in visual baseline on KS country alias'],
  ['crm-visual-mk-mk', 'opt-in visual baseline on MK country alias'],
  ['setup-ks', 'legacy auth state bootstrap for KS alias lane'],
  ['setup-mk', 'legacy auth state bootstrap for MK alias lane'],
  ['ks-sq', 'legacy full-suite KS alias lane'],
  ['mk-mk', 'legacy full-suite MK alias lane'],
  ['pilot-mk', 'pilot alias lane'],
  ['smoke', 'legacy smoke lane on KS alias'],
]);

const TENANT_HOST_FILE_ALLOWLIST = new Map([
  [
    'apps/web/e2e/setup.state.spec.ts',
    'legacy auth state bootstrap derives tenant from project host',
  ],
  [
    'apps/web/e2e/fixtures/auth.fixture.ts',
    'shared fixture propagates legacy project host headers',
  ],
  [
    'apps/web/e2e/fixtures/auth.fixture.vitest.ts',
    'fixture unit contract uses historical host sample',
  ],
  [
    'apps/web/e2e/gate/register-tenant-attribution.spec.ts',
    'explicit tenant-host attribution contract',
  ],
  ['apps/web/e2e/gate/tenant-resolution.spec.ts', 'explicit tenant resolution contract'],
  [
    'apps/web/e2e/gate/v1-live-surface-revalidation.spec.ts',
    'pilot/live host revalidation contract',
  ],
  ['apps/web/e2e/live/pilot-day1-drive.spec.ts', 'live pilot host alias check'],
  ['apps/web/e2e/live/pilot-day1-lifecycle.spec.ts', 'live pilot host alias check'],
  ['apps/web/e2e/live/temp-check-claims.spec.ts', 'temporary live host diagnostic'],
  ['apps/web/e2e/pilot/_host.ts', 'pilot helper resolving actor host aliases'],
  [
    'apps/web/e2e/pilot/c1-03-pilot-member-provisioning.spec.ts',
    'pilot cross-host provisioning check',
  ],
  ['apps/web/e2e/pilot/c1-04-pilot-staff-triage.spec.ts', 'pilot cross-host staff triage check'],
  [
    'apps/web/e2e/pilot/c2-02-cross-tenant-artifact-isolation.spec.ts',
    'cross-tenant isolation check',
  ],
  [
    'apps/web/e2e/pilot/c2-03-cross-tenant-write-isolation.spec.ts',
    'cross-tenant write isolation check',
  ],
  [
    'apps/web/e2e/pilot/c2-04-cross-tenant-staff-member-write-isolation.spec.ts',
    'cross-tenant staff/member write isolation check',
  ],
  ['apps/web/e2e/pilot/scenario-01-ks-e2e.spec.ts', 'pilot scenario cross-tenant actor check'],
  [
    'apps/web/e2e/support/admin-tenant-classification.ts',
    'admin tenant classification support helper',
  ],
]);

const E2E_FILE_GLOBS = [`${e2eRoot}/**/*.{ts,tsx}`];
const COUNTRY_HOST_PATTERN =
  /\b(?:ks|mk|al|pilot)\.(?:localhost|127\.0\.0\.1\.nip\.io|interdomestik\.com)(?::\d+)?\b/iu;
const TENANT_HOST_ENV_PATTERN = /\b(?:KS|MK|AL|PILOT)_HOST\b/u;
const FORWARDED_HOST_PATTERN = /['"`]x-forwarded-host['"`]\s*[:\]]/iu;
const TENANT_BASE_URL_PATTERN = /tenantBaseUrl\s*\(/u;
const TENANT_BASE_URL_HOST_PATTERN = /tenantBaseUrl\s*\(\s*(KS_HOST|MK_HOST|AL_HOST|PILOT_HOST)\b/u;
const TENANT_HOST_USAGE_PATTERNS = [
  COUNTRY_HOST_PATTERN,
  TENANT_HOST_ENV_PATTERN,
  FORWARDED_HOST_PATTERN,
  TENANT_BASE_URL_PATTERN,
];
const TENANT_HOST_PROJECT_PATTERNS = [
  COUNTRY_HOST_PATTERN,
  TENANT_HOST_ENV_PATTERN,
  TENANT_BASE_URL_HOST_PATTERN,
  FORWARDED_HOST_PATTERN,
];

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

function unwrapExpression(node) {
  if (ts.isParenthesizedExpression(node)) return unwrapExpression(node.expression);
  return node;
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
    throw new Error(`${playwrightConfigPath}: missing Playwright projects array`);
  }

  return projectsArray;
}

function expressionUsesTenantHost(sourceFile, expression) {
  const text = expression.getText(sourceFile);
  return TENANT_HOST_PROJECT_PATTERNS.some(pattern => pattern.test(text));
}

function collectProjectObjects(node) {
  const expression = unwrapExpression(node);
  if (ts.isObjectLiteralExpression(expression)) return [expression];
  if (ts.isSpreadElement(expression)) return collectProjectObjects(expression.expression);
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.flatMap(element => collectProjectObjects(element));
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...collectProjectObjects(expression.whenTrue),
      ...collectProjectObjects(expression.whenFalse),
    ];
  }
  return [];
}

function collectTenantHostProjects(playwrightConfig) {
  const sourceFile = ts.createSourceFile(
    playwrightConfigPath,
    playwrightConfig,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const projectsArray = findProjectsArray(sourceFile);
  const projects = [];

  for (const project of projectsArray.elements.flatMap(element => collectProjectObjects(element))) {
    const name = getObjectProperty(project, 'name');
    if (!name || !ts.isStringLiteralLike(name.initializer)) continue;

    if (expressionUsesTenantHost(sourceFile, project)) {
      projects.push(name.initializer.text);
    }
  }

  return projects;
}

function computeLineCol(text, index) {
  const upTo = text.slice(0, index);
  const lines = upTo.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function findTenantHostUsage(content) {
  return TENANT_HOST_USAGE_PATTERNS.map(pattern => pattern.exec(content))
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)[0];
}

async function enforcePlaywrightProjectInventory(violations) {
  const configAbsPath = path.join(repoRoot, playwrightConfigPath);
  const playwrightConfig = await readFile(configAbsPath, 'utf8');
  const projects = collectTenantHostProjects(playwrightConfig);

  for (const project of projects) {
    if (!TENANT_HOST_PROJECTS.has(project)) {
      violations.push(
        `${playwrightConfigPath}: Playwright project "${project}" uses tenant-host routing but is not in the alias/regression inventory.`
      );
    }
  }

  if (printInventory) {
    console.log('Tenant-host Playwright project inventory:');
    for (const project of projects) {
      console.log(`- ${project}: ${TENANT_HOST_PROJECTS.get(project) ?? 'UNCLASSIFIED'}`);
    }
  }

  return projects;
}

async function enforceE2EFileInventory(violations) {
  const files = await glob(E2E_FILE_GLOBS, {
    cwd: repoRoot,
    nodir: true,
    ignore: [`${e2eRoot}/**/node_modules/**`, `${e2eRoot}/**/test-results/**`],
  });
  const matchedFiles = [];

  for (const relPath of files.sort()) {
    const content = await readFile(path.join(repoRoot, relPath), 'utf8');
    const match = findTenantHostUsage(content);
    if (!match) continue;

    matchedFiles.push(relPath);
    if (TENANT_HOST_FILE_ALLOWLIST.has(relPath)) continue;

    const { line, col } = computeLineCol(content, match.index);
    const excerpt = content.split('\n')[line - 1]?.trim() ?? '';
    violations.push(
      [
        `${relPath}:${line}:${col} tenant-host-identity-usage ${excerpt}`,
        'Direct country-host tenant identity is limited to inventoried alias/regression files.',
        'Use ida/session-context setup for new dashboard/auth specs instead of x-forwarded-host or ks/mk host literals.',
      ].join('\n')
    );
  }

  if (printInventory) {
    console.log('Tenant-host E2E file inventory:');
    for (const relPath of matchedFiles) {
      console.log(`- ${relPath}: ${TENANT_HOST_FILE_ALLOWLIST.get(relPath) ?? 'UNCLASSIFIED'}`);
    }
  }

  return matchedFiles;
}

async function main() {
  const violations = [];
  const projects = await enforcePlaywrightProjectInventory(violations);
  const files = await enforceE2EFileInventory(violations);

  if (violations.length > 0) {
    console.error('E2E tenant-host lane violations found:\n');
    for (const violation of violations) console.error(`${violation}\n`);
    process.exit(1);
  }

  console.log(
    `E2E tenant-host lane guard passed (${projects.length} projects, ${files.length} files inventoried).`
  );
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
