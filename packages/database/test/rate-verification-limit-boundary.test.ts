import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import database from '../package.json' with { type: 'json' };

const root = fileURLToPath(new URL('../../../', import.meta.url));
const databaseDir = resolve(root, 'packages/database');
const writer = 'src/scripts/rate-verification-limit';
const cli = 'src/scripts/set-rate-verification-limit';
const cliFile = 'packages/database/src/scripts/set-rate-verification-limit.ts';
const releaseFixture = 'test/exchange-rates-release.fixture';
const privateModules = [writer, cli, releaseFixture];
const testFixtures = ['test/exchange-rates.fixture', 'test/exchange-rates-release-client.fixture'];
const testingExport = './testing/rate-verification-limit';
const extensions = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

function modulePath(path: string): string {
  return path.replace(/^\.\//u, '').replace(/\.[cm]?[jt]sx?$/u, '');
}

function exportTargets(target: unknown): string[] {
  if (typeof target === 'string') return [target];
  if (target && typeof target === 'object') return Object.values(target).flatMap(exportTargets);
  return [];
}

const entries = new Map(
  Object.entries(database.exports).map(([key, target]) => [
    key,
    exportTargets(target).map(modulePath),
  ])
);

function concreteExports(
  packageExports: Record<string, unknown>,
  fileExists: (file: string) => boolean
) {
  const targetsByKey = new Map<string, string[]>();
  let files: string[] | undefined;
  const add = (key: string, file: string) => {
    const targets = targetsByKey.get(key) ?? [];
    targets.push(file);
    targetsByKey.set(key, targets);
  };
  for (const [key, entry] of Object.entries(packageExports)) {
    for (const target of exportTargets(entry)) {
      if (!target.includes('*')) {
        add(key, resolve(databaseDir, target));
        continue;
      }
      files ??= globSync('**/*', { cwd: databaseDir, exclude: ['**/node_modules/**'] });
      const [prefix, ...suffixes] = target
        .replace(/^\.\//u, '')
        .split('*')
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
      const pattern = new RegExp(`^${prefix}(?<subpath>.*)${suffixes.join('\\k<subpath>')}$`, 'u');
      for (const file of files) {
        const match = pattern.exec(file);
        if (match && fileExists(resolve(databaseDir, file))) {
          add(
            key.replaceAll('*', () => match[1]),
            resolve(databaseDir, file)
          );
        }
      }
    }
  }
  return targetsByKey;
}

function staticImports(file: string, source: string): string[] {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest).statements.flatMap(statement => {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;
      return specifier && ts.isStringLiteral(specifier) ? [specifier.text] : [];
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference)
    ) {
      const specifier = statement.moduleReference.expression;
      return specifier && ts.isStringLiteral(specifier) ? [specifier.text] : [];
    }
    return [];
  });
}

function isDatabaseFile(file: string) {
  const path = relative(databaseDir, file);
  const parts = path.split(sep);
  return !isAbsolute(path) && parts[0] !== '..' && !parts.includes('node_modules');
}

function privateExportViolations(
  packageExports: Record<string, unknown>,
  inMemorySources = new Map<string, string>()
) {
  const host = {
    ...ts.sys,
    fileExists: (file: string) => inMemorySources.has(file) || ts.sys.fileExists(file),
    readFile: (file: string) => inMemorySources.get(file) ?? ts.sys.readFile(file),
  };
  const targetsByKey = concreteExports(packageExports, host.fileExists);
  const dependencies = new Map<string, string[]>();
  const resolverOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler };

  function resolveImport(file: string, specifier: string): string[] {
    if (specifier === database.name) return targetsByKey.get('.') ?? [];
    if (specifier.startsWith(`${database.name}/`)) {
      const targets = targetsByKey.get(`.${specifier.slice(database.name.length)}`);
      if (targets) return targets;
    }
    const { resolvedModule } = ts.resolveModuleName(specifier, file, resolverOptions, host);
    return resolvedModule ? [resolvedModule.resolvedFileName] : [];
  }

  function reachablePrivateModule(target: string) {
    const seen = new Set<string>();
    const pending = [target];
    for (const file of pending) {
      if (!isDatabaseFile(file) || seen.has(file)) continue;
      seen.add(file);
      const path = relative(databaseDir, file);
      if (privateModules.includes(modulePath(path))) return path;

      let imports = dependencies.get(file);
      if (!imports) {
        const source = host.readFile(file);
        assert.ok(source !== undefined, `Cannot read database module ${path}`);
        imports = staticImports(file, source).flatMap(specifier => resolveImport(file, specifier));
        dependencies.set(file, imports);
      }
      pending.push(...imports);
    }
  }

  return [...targetsByKey].flatMap(([key, targets]) =>
    [...new Set(targets)].flatMap(target => {
      const reached = reachablePrivateModule(target);
      return reached ? [`${key} -> ${relative(databaseDir, target)} reaches ${reached}`] : [];
    })
  );
}

function importedTargets(file: string, specifier: string): string[] {
  const prefix = `${database.name}/`;
  if (specifier.startsWith(prefix)) {
    const subpath = modulePath(specifier.slice(prefix.length));
    // Include the removed export and the web app's @interdomestik/database/* source alias.
    if (subpath === 'rate-verification-limit') return [writer];
    if (subpath === testingExport.slice(2)) return [releaseFixture];
    return [...(entries.get(`./${subpath}`) ?? []), subpath, `src/${subpath}`];
  }
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return [];
  return [modulePath(relative(databaseDir, resolve(root, dirname(file), specifier)))];
}

function forbiddenImports(file: string, source: string) {
  // TypeScript's scanner includes re-exports, literal dynamic imports and require calls.
  return ts.preProcessFile(source, true, true).importedFiles.flatMap(({ fileName, pos }) => {
    const targets = importedTargets(file, fileName);
    const forbidden = targets.some(target => {
      if (target === writer && file === cliFile) return false;
      return privateModules.includes(target) || testFixtures.includes(target);
    });
    if (!forbidden) return [];
    const line = source.slice(0, pos).split('\n').length;
    return [`${file}:${line} ${fileName}`];
  });
}

test('database package exports keep the release writer, CLI and release fixture private', () => {
  assert.equal(Object.hasOwn(database.exports, './rate-verification-limit'), false);
  assert.equal(Object.hasOwn(database.exports, testingExport), false);
  assert.deepEqual(privateExportViolations(database.exports), []);
});

test('other package exports cannot reach the release writer, CLI or release fixture', () => {
  const entry = 'test/public-release.ts';
  const paymentPortExport = './testing/payment-port-rls';
  const paymentPortFixture = './test/exchange-rates.fixture.ts';
  const sources = new Map([
    [resolve(databaseDir, entry), "export * from '../src/scripts/rate-verification-limit.js';"],
    [resolve(databaseDir, 'test/release-bridge.ts'), "export * from './public-release';"],
    [
      resolve(databaseDir, paymentPortFixture),
      "export { withPaymentPortReleaseClient } from './exchange-rates-release.fixture';",
    ],
  ]);
  assert.deepEqual(
    privateExportViolations(
      {
        './public-release': `./${entry}`,
        './bridge': './test/release-bridge.ts',
        './public/*': './src/scripts/*-rate-verification-limit.ts',
        [paymentPortExport]: paymentPortFixture,
      },
      sources
    ),
    [
      './public-release -> test/public-release.ts reaches src/scripts/rate-verification-limit.ts',
      './bridge -> test/release-bridge.ts reaches src/scripts/rate-verification-limit.ts',
      './public/set -> src/scripts/set-rate-verification-limit.ts reaches src/scripts/set-rate-verification-limit.ts',
      './testing/payment-port-rls -> test/exchange-rates.fixture.ts reaches test/exchange-rates-release.fixture.ts',
    ]
  );
});

test('a conditional test export cannot expose the release fixture', () => {
  assert.deepEqual(
    privateExportViolations({
      [testingExport]: { 'interdomestik-test': `./${releaseFixture}.ts` },
    }),
    [`${testingExport} -> ${releaseFixture}.ts reaches ${releaseFixture}.ts`]
  );
});

test('the release CLI is the only production importer of the writer', async () => {
  const violations: string[] = [];
  // Scanning every src module also catches any intermediate src re-export from a package entry.
  const files = glob([`apps/**/*.${extensions}`, `packages/*/src/**/*.${extensions}`], {
    cwd: root,
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/src/test/**',
      `**/*.test.${extensions}`,
      `**/*.test-support.${extensions}`,
    ],
  });
  for await (const file of files) {
    const source = await readFile(resolve(root, file), 'utf8');
    violations.push(...forbiddenImports(file, source));
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});

test('the scanner rejects production imports and re-exports of release code', () => {
  const file = 'apps/web/src/example.ts';
  const examples = [
    "import { setRateVerificationLimit } from '@interdomestik/database/testing/rate-verification-limit';",
    "import { setRateVerificationLimit } from '@interdomestik/database/scripts/rate-verification-limit';",
    "import '../../../packages/database/test/exchange-rates-release.fixture';",
    "export * from '../../../packages/database/src/scripts/rate-verification-limit.js';",
    "const release = require('@interdomestik/database/testing/rate-verification-limit');",
    "const release = import('@interdomestik/database/scripts/rate-verification-limit');",
  ];
  for (const source of examples) {
    assert.equal(forbiddenImports(file, source).length, 1, source);
  }
  assert.deepEqual(forbiddenImports(cliFile, "import './rate-verification-limit';"), []);
});
