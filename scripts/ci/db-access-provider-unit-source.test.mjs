import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { digest } from './db-access-trust.mjs';
import { createSourceModel } from './db-access-source.mjs';
import {
  verifyProviderUnitSource,
  isVerifiedProviderUnitSource,
} from './db-access-provider-unit-source.mjs';

const ENTRY = 'packages/database/src/provider.ts';
const PRIVATE = 'packages/database/src/private.ts';
const CONSUMER = 'apps/web/src/caller.ts';
const PACKAGE = 'packages/database/package.json';
const BASELINE = 'scripts/ci/db-access-baseline.json';

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-unit-source-'));
  const sources = new Map([
    [ENTRY, "import { secret } from './private'; export function provider() { return secret(); }"],
    [PRIVATE, 'export function secret() { return 1; }'],
    [
      CONSUMER,
      "import { provider } from '@interdomestik/database'; export const call = () => provider();",
    ],
    [
      PACKAGE,
      JSON.stringify({ name: '@interdomestik/database', exports: { '.': './src/provider.ts' } }),
    ],
    [BASELINE, '{"entries":[]}\n'],
  ]);
  const write = (file, source) => {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
    sources.set(file, source);
  };
  for (const [file, source] of sources) write(file, source);
  const record = file => ({
    sha256: digest(sources.get(file)),
    bytes: Buffer.byteLength(sources.get(file)),
    mode: '100644',
  });
  const adoption = {
    commit: '1'.repeat(40),
    tree: '2'.repeat(40),
    files: { [BASELINE]: digest(sources.get(BASELINE)) },
  };
  const policy = {
    version: 1,
    id: 'fixture-only-source-unit',
    adoptionCommit: adoption.commit,
    adoptionTree: adoption.tree,
    baselineSha256: adoption.files[BASELINE],
    baselineBytes: Buffer.byteLength(sources.get(BASELINE)),
    files: {
      [ENTRY]: { ...record(ENTRY), local: [PRIVATE], external: [] },
      [PRIVATE]: { ...record(PRIVATE), local: [], external: [] },
    },
    resolverFiles: { [PACKAGE]: record(PACKAGE) },
    publicModules: [ENTRY],
    testHarness: {},
  };
  const verify = () => verifyProviderUnitSource(root, createSourceModel(sources), adoption, policy);
  try {
    run({ root, sources, write, record, adoption, policy, verify });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('exact source unit authenticates but cannot claim runtime admission', () =>
  fixture(({ verify }) => {
    const proof = verify();
    assert.equal(isVerifiedProviderUnitSource(proof), true);
    assert.equal(proof.runtimeAdmission, false);
    assert.equal(isVerifiedProviderUnitSource(JSON.parse(JSON.stringify(proof))), false);
    assert.equal(isVerifiedProviderUnitSource({ runtimeAdmission: true }), false);
    assert.deepEqual(proof.files, [PRIVATE, ENTRY].sort());
  }));

test('same signatures with unsafe behavior do not authenticate', () =>
  fixture(({ write, verify }) => {
    write(PRIVATE, 'export function secret() { return process.env.PRIVATE_DATA; }');
    assert.throws(verify, /source\/mode mismatch/);
  }));

test('provider dependency drift refuses before boundary cutting', () =>
  fixture(({ write, verify }) => {
    write(PRIVATE, 'export function secret() { return 2; }');
    assert.throws(verify, /source\/mode mismatch/);
  }));

test('new source cannot silently extend the finite dependency closure', () =>
  fixture(({ write, record, policy, verify }) => {
    write('packages/database/src/new.ts', 'export const added = 1;');
    write(PRIVATE, "import { added } from './new'; export function secret() { return added; }");
    policy.files[PRIVATE] = {
      ...record(PRIVATE),
      local: ['packages/database/src/new.ts'],
      external: [],
    };
    assert.throws(verify, /dependency leaves approved closure/);
  }));

test('a dependency omitted from the source policy refuses', () =>
  fixture(({ write, record, policy, verify }) => {
    write(
      PRIVATE,
      "import { createHash } from 'node:crypto'; export function secret() { return createHash; }"
    );
    policy.files[PRIVATE] = { ...record(PRIVATE), local: [], external: [] };
    assert.throws(verify, /dependency mismatch/);
  }));

for (const statement of [
  "import { secret } from '../../../packages/database/src/private';",
  "export * from '../../../packages/database/src/private';",
  "const value = import('../../../packages/database/src/private');",
  "const value = require('../../../packages/database/src/private');",
  "import value = require('../../../packages/database/src/private');",
]) {
  test('private incoming edge refuses: ' + statement, () =>
    fixture(({ write, verify }) => {
      write(CONSUMER, statement);
      assert.throws(verify, /unauthorized incoming import/);
    })
  );
}

test('a test suffix is no private-import authorization', () =>
  fixture(({ write, verify }) => {
    write(
      'apps/web/src/private.test.ts',
      "import { secret } from '../../../packages/database/src/private';"
    );
    assert.throws(verify, /unauthorized incoming import/);
  }));

test('a reviewed harness binds exact bytes rather than all test filenames', () =>
  fixture(({ write, record, policy, verify }) => {
    const file = 'packages/database/test/provider.test.ts';
    write(file, "import { secret } from '../src/private'; secret();");
    policy.testHarness[file] = record(file);
    assert.equal(verify().runtimeAdmission, false);
    write(file, "import { secret } from '../src/private'; secret(); secret();");
    assert.throws(verify, /source\/mode mismatch/);
  }));

test('candidate resolver alias changes cannot reuse an authenticated unit', () =>
  fixture(({ write, verify }) => {
    write(
      PACKAGE,
      JSON.stringify({ name: '@interdomestik/database', exports: { '.': './src/private.ts' } })
    );
    assert.throws(verify, /source\/mode mismatch/);
  }));

test('the parsed model must match authenticated filesystem source', () =>
  fixture(({ sources, verify }) => {
    sources.set(PRIVATE, 'export function secret() { return false; }');
    assert.throws(verify, /model\/source mismatch/);
  }));

test('symlink substitution refuses even for identical bytes', () =>
  fixture(({ root, verify }) => {
    const actual = path.join(root, PRIVATE);
    const other = path.join(root, 'identical.ts');
    fs.renameSync(actual, other);
    fs.symlinkSync(other, actual);
    assert.throws(verify, /symlink/);
  }));

test('executable mode drift refuses', () =>
  fixture(({ root, verify }) => {
    fs.chmodSync(path.join(root, PRIVATE), 0o755);
    assert.throws(verify, /source\/mode mismatch/);
  }));

test('original historical baseline identity stays required', () =>
  fixture(({ write, verify }) => {
    write(BASELINE, '{"entries":[{}]}\n');
    assert.throws(verify, /source\/mode mismatch/);
  }));

test('wrong adoption identity refuses', () =>
  fixture(({ adoption, verify }) => {
    adoption.tree = '3'.repeat(40);
    assert.throws(verify, /adoption binding mismatch/);
  }));

test('the approved driver patch is part of the exact resolver boundary', () =>
  fixture(({ write, record, policy, verify }) => {
    const file = 'patches/postgres@3.4.9.patch';
    write(file, 'approved driver patch');
    policy.resolverFiles[file] = record(file);
    assert.equal(verify().runtimeAdmission, false);
    write(file, 'unreviewed driver patch');
    assert.throws(verify, /source\/mode mismatch/);
  }));
