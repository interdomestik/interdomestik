import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { materializeP2Capsule } from '../../p2/capsule-layout.mjs';
import { ts } from '../../p2/libraries.mjs';
import {
  structuredArtifactOwner,
  classifyModularityFile,
  FILE_CLASSES,
} from '../../../modularity-guard-policy.mjs';
const root = path.resolve(import.meta.dirname, '../../p2');
const read = file => fs.readFileSync(path.join(root, file));
const provenance = JSON.parse(read('dist/generated-provenance.json'));
test('every retained generated output matches its exact provenance bytes', () => {
  for (const record of provenance.outputs) {
    const bytes = read(record.path);
    assert.equal(bytes.length, record.bytes, record.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, record.path);
  }
});
test('actual pinned TypeScript reproduces both wrapper scripts and source maps byte-for-byte', () => {
  assert.equal(ts.version, provenance.versions.compilerVersion);
  for (const name of ['wrapper', 'wrapper.test', 'relay']) {
    const source = read('capsule/dist/' + name + '.source.ts').toString();
    const result = ts.transpileModule(source, {
      fileName: name + '.source.ts',
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        sourceMap: true,
        inlineSources: true,
      },
      reportDiagnostics: true,
    });
    assert.equal(
      result.diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error).length,
      0
    );
    assert.equal(result.outputText, read('capsule/dist/' + name + '.mjs').toString());
    assert.equal(result.sourceMapText, read('capsule/dist/' + name + '.js.map').toString());
  }
});
test('fixed materialization preserves image filenames and every source byte', () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-layout-'))),
    output = path.join(parent, 'capsule');
  try {
    materializeP2Capsule(root, output);
    const layout = JSON.parse(read('capsule-layout.json'));
    assert.deepEqual(fs.readdirSync(output).sort(), Object.keys(layout).sort());
    for (const [file, source] of Object.entries(layout))
      assert.deepEqual(fs.readFileSync(path.join(output, file)), read(source));
    assert.throws(() => materializeP2Capsule(root, output), /Fresh/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('Node materialization uses fixed 0644 file modes under real umask 077', () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-layout-077-')));
  const output = path.join(parent, 'capsule');
  const previous = process.umask(0o077);
  try {
    materializeP2Capsule(root, output);
    for (const file of fs.readdirSync(output))
      assert.equal(fs.statSync(path.join(output, file)).mode & 0o7777, 0o644, file);
    assert.equal(fs.statSync(output).mode & 0o7777, 0o700);
  } finally {
    process.umask(previous);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
test('generated class applies to real dist outputs; authored controls remain production', () => {
  for (const record of provenance.outputs)
    assert.equal(
      classifyModularityFile('scripts/ci/p2/' + record.path),
      FILE_CLASSES.generatedOrLock
    );
  for (const file of [
    'capsule/run-suite.mjs',
    'runtime.mjs',
    'bootstrap.mjs',
    'capsule-layout.mjs',
  ])
    assert.equal(classifyModularityFile('scripts/ci/p2/' + file), FILE_CLASSES.productionCode);
  for (const file of ['policy', 'capsule-layout'])
    assert.equal(
      structuredArtifactOwner('scripts/ci/p2/' + file + '.json'),
      'p2-fixed-producer-contract'
    );
  assert.equal(structuredArtifactOwner('scripts/ci/p2/foreign.json'), null);
  assert.equal(structuredArtifactOwner('scripts/ci/foreign/policy.json'), null);
});

test('current capsule actual export authority is exactly one pure mapper', async () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-mapper-authority-'))),
    output = path.join(parent, 'capsule');
  try {
    materializeP2Capsule(root, output);
    const { adapter } = await import(pathToFileURL(path.join(output, 'registry.mjs')).href);
    const actual = adapter.importActual('@/server/operations/m4-assignment-relay');
    assert(Object.isFrozen(actual));
    assert.deepEqual(Object.keys(actual), ['assignmentRelayFailure']);
    assert.equal(typeof actual.assignmentRelayFailure, 'function');
    for (const id of [
      'node:fs',
      'node:https',
      '@/server/operations/m4-assignment-relay-extra',
      'next/cache',
    ])
      assert.throws(() => adapter.importActual(id), /No actual module authority/);
    assert.throws(() => adapter.queueMock('node:https', null, () => ({})), /Unclosed mock/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
