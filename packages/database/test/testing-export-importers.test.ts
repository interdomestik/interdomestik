import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const HELPER = 'packages/database/src/testing/claim-notification-cleanup.ts';
const HELPER_STEM = HELPER.replace(/\.ts$/, '');
const EXPORT = '@interdomestik/database/testing/claim-notification-cleanup';
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

/** True when a specifier in `file` resolves to the helper: by its export or by a relative path. */
export function resolvesToHelper(file: string, specifier: string): boolean {
  if (specifier === EXPORT) return true;
  if (!specifier.startsWith('.')) return false;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  return target.replace(SOURCE, '').replace(/\/index$/, '') === HELPER_STEM;
}

/**
 * True when any string literal in the parsed file names the helper. The syntax tree skips
 * comments and decodes escapes; counting every literal, not only import positions, also covers
 * re-exports, import(), require(), createRequire, require.resolve and type imports.
 */
export function importsHelper(file: string, text: string): boolean {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const visit = (node: ts.Node): boolean =>
    (ts.isStringLiteralLike(node) && resolvesToHelper(file, node.text)) ||
    (ts.forEachChild(node, visit) ?? false);
  return visit(source);
}
// The seed cleanup removes the same rows before it deletes seeded claims, messages and users.
const SEED_CALLERS = new Set([
  'packages/database/src/seed-full/cleanup.ts',
  'packages/database/src/seed-utils/cleanup.ts',
  'packages/database/src/seed-utils/run-cleanup.ts',
]);

/** Allowed importers: browser specs and their fixtures, test files, and the seed cleanup. */
export function isAllowedImporter(file: string): boolean {
  return (
    file.startsWith('apps/web/e2e/') || /\.test\.[cm]?[jt]sx?$/.test(file) || SEED_CALLERS.has(file)
  );
}

function trackedImporters(): string[] {
  return execFileSync('/usr/bin/git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(file => SOURCE.test(file) && file !== HELPER)
    .filter(file => importsHelper(file, readFileSync(path.join(ROOT, file), 'utf8')));
}

test('the claim notification cleanup helper is imported only by tests, browser specs and the seed cleanup', () => {
  const importers = trackedImporters();
  assert.ok(importers.length > 0, 'expected at least one importer of the cleanup helper');
  for (const caller of SEED_CALLERS) assert.ok(importers.includes(caller), caller);
  assert.deepEqual(
    importers.filter(file => !isAllowedImporter(file)),
    [],
    'the cleanup helper deletes rows with the caller client and is a test helper only'
  );
});

test('the importer rule refuses production paths, including the database package', () => {
  for (const file of [
    'apps/web/src/actions/notifications.core.ts',
    'apps/web/src/app/api/cron/notifications/route.ts',
    'packages/domain-claims/src/claims/send-message.ts',
    'packages/database/src/index.ts',
    'packages/database/src/schema.ts',
    'packages/database/src/seed-utils/seed-ids.ts',
    'scripts/pilot/admin-users-unread.ts',
    'tools/review-evidence-console/api/index.mjs',
  ]) {
    assert.equal(isAllowedImporter(file), false, file);
  }
  for (const file of [
    'apps/web/e2e/gate/member-locale.fixture.ts',
    'scripts/pilot/admin-users-unread.test.ts',
    'packages/database/test/seed-notification-cleanup.test.ts',
    'packages/database/src/seed-utils/cleanup.ts',
  ]) {
    assert.equal(isAllowedImporter(file), true, file);
  }
});

test('specifiers resolve against the importing file, including siblings of the helper', () => {
  const cases: Array<[string, string, boolean]> = [
    ['apps/web/e2e/gate/x.fixture.ts', `import { a } from '${EXPORT}';`, true],
    [
      'packages/database/src/index.ts',
      "export * from './testing/claim-notification-cleanup';",
      true,
    ],
    [
      'packages/database/src/testing/message-fixtures.ts',
      "export * from './claim-notification-cleanup';",
      true,
    ],
    [
      'packages/database/src/testing/message-fixtures.ts',
      "import './claim-notification-cleanup.ts';",
      true,
    ],
    [
      'packages/database/src/seed-utils/cleanup.ts',
      "import { a } from '../testing/claim-notification-cleanup';",
      true,
    ],
    [
      'packages/domain-claims/src/claims/x.ts',
      "await import('../../../database/src/testing/claim-notification-cleanup');",
      true,
    ],
    [
      'packages/domain-claims/src/claims/x.ts',
      'const m = require(`@interdomestik/database/testing/claim-notification-cleanup`);',
      true,
    ],
    [
      'packages/database/src/testing/message-fixtures.ts',
      "export * from /* sibling */ './claim-notification-cleanup';",
      true,
    ],
    [
      'tools/review-evidence-console/api/index.mjs',
      "const load = createRequire(import.meta.url);\nload('../../../packages/database/src/testing/claim-notification-cleanup.ts');",
      true,
    ],
    [
      'packages/domain-claims/src/claims/x.ts',
      "import { a } from '@interdomestik/database/testing/claim\\u002dnotification-cleanup';",
      true,
    ],
    [
      'packages/database/src/testing/message-fixtures.ts',
      "// export * from './claim-notification-cleanup';\n/* import './claim-notification-cleanup'; */",
      false,
    ],
    [
      'packages/database/src/testing/message-fixtures.ts',
      "import { a } from './claim-notification-cleanup-copy';",
      false,
    ],
    ['packages/database/src/index.ts', "import { a } from './claim-notification-cleanup';", false],
  ];
  for (const [file, line, expected] of cases) {
    assert.equal(importsHelper(file, line), expected, `${file}: ${line}`);
  }
});
