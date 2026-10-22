import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { digest } from './db-access-trust.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { NAMED_PROOF_FILES, verifyNamedProofSource } from './db-access-named-proof-source.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const files = { ...PROVIDER_UNIT_POLICY.files, ...PROVIDER_UNIT_POLICY.namedProof.files };
const sources = new Map(
  Object.keys(files).map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')])
);
sources.set(
  'packages/database/package.json',
  fs.readFileSync(path.join(root, 'packages/database/package.json'), 'utf8')
);
sources.set(
  'apps/web/package.json',
  fs.readFileSync(path.join(root, 'apps/web/package.json'), 'utf8')
);
const model = createSourceModel(sources);
function exact(directory, file, expected) {
  const bytes = fs.readFileSync(path.join(directory, file));
  assert.equal(bytes.length, expected.bytes, 'source length drift');
  assert.equal(digest(bytes), expected.sha256, 'source digest drift');
  return bytes.toString();
}
const policy = () => structuredClone(PROVIDER_UNIT_POLICY);
const verify = (p = PROVIDER_UNIT_POLICY, m = model) => verifyNamedProofSource(root, m, p, exact);

test('ten exact named operations authenticate with 22 bound dependencies and no runtime admission', () => {
  assert.deepEqual(verify(), [...NAMED_PROOF_FILES]);
  assert.equal(Object.keys(PROVIDER_UNIT_POLICY.namedProof.files).length, 22);
  assert.equal(PROVIDER_UNIT_POLICY.namedProof.runtimeRequired, true);
});
test('candidate-supplied receipt, omitted runtime and reduced test count cannot replace execution', () => {
  for (const [key, value] of [
    ['acceptedReceiptInputs', true],
    ['runtimeRequired', false],
    ['requiredTests', 16],
  ]) {
    const p = policy();
    p.namedProof[key] = value;
    assert.throws(() => verify(p), /contract identity/);
  }
});
test('a new test filename never receives the named boundary', () => {
  const p = policy();
  p.namedProof.operations.push('apps/web/src/arbitrary.test.ts');
  assert.throws(() => verify(p), /contract identity/);
});
test('source byte drift rejects even when the source parses', () => {
  const p = policy();
  p.namedProof.files[NAMED_PROOF_FILES[0]].sha256 = '0'.repeat(64);
  assert.throws(() => verify(p), /source digest drift/);
});
test('model substitution cannot inherit reviewed source authority', () => {
  const parsed = new Map(model.parsed);
  parsed.set(
    NAMED_PROOF_FILES[0],
    ts.createSourceFile(
      NAMED_PROOF_FILES[0],
      'export const replaced=true;',
      ts.ScriptTarget.Latest,
      true
    )
  );
  assert.throws(() => verify(undefined, { ...model, parsed }), /model\/source mismatch/);
});
test('dependency substitution is rejected independently from file identity', () => {
  const p = policy();
  p.namedProof.files[NAMED_PROOF_FILES[0]].imports['@sentry/nextjs'] =
    'packages/database/src/db.ts';
  assert.throws(() => verify(p), /dependency mismatch/);
});
test('configuration drift rejects the fixed health schema alias', () => {
  const p = policy();
  p.namedProof.configuration.sha256 = '0'.repeat(64);
  assert.throws(() => verify(p), /source digest drift/);
});
test('ordinary code cannot import provisioning or named test bodies', () => {
  for (const target of [NAMED_PROOF_FILES[3], ...NAMED_PROOF_FILES.slice(5)]) {
    const file = 'apps/web/src/ordinary.ts';
    const specifier = '../../../' + target;
    const parsed = new Map(model.parsed);
    parsed.set(
      file,
      ts.createSourceFile(file, `import '${specifier}';`, ts.ScriptTarget.Latest, true)
    );
    assert.throws(
      () => verify(undefined, { ...model, parsed }),
      /ordinary consumer imports private proof/
    );
  }
});
