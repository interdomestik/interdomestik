import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { M4_RUNTIME_CONTRACT as contract } from './db-access-m4-runtime-contract.mjs';
import { verifyM4Metafile } from './db-access-m4-runtime-closure.mjs';
import { sealM4Image, assertM4ImageUnchanged } from './db-access-m4-runtime-seal.mjs';
const meta = () => ({
  inputs: Object.fromEntries(
    [contract.entryFile, ...contract.expectedInputs].map(file => [file, { imports: [] }])
  ),
  outputs: {
    'm4-runtime.cjs': {
      entryPoint: contract.entryFile,
      imports: contract.outputExternalSpecifiers.map(path => ({ path, external: true })),
    },
  },
});
test('fixed finite closure identity accepts only declared inputs/output/external identities', () => {
  assert.match(verifyM4Metafile(meta(), contract), /^[a-f0-9]{64}$/u);
});
for (const [name, change] of [
  ['extra input', m => (m.inputs['unbound.ts'] = { imports: [] })],
  ['missing input', m => delete m.inputs[contract.expectedInputs[0]]],
  [
    'new external',
    m => m.inputs[contract.entryFile].imports.push({ path: 'unbound-package', external: true }),
  ],
  [
    'unresolved local',
    m => m.inputs[contract.entryFile].imports.push({ path: 'unbound.ts', external: false }),
  ],
  ['different entry', m => (m.outputs['m4-runtime.cjs'].entryPoint = 'other.ts')],
  ['extra output', m => (m.outputs['other.cjs'] = { entryPoint: contract.entryFile, imports: [] })],
  ['output external omitted', m => m.outputs['m4-runtime.cjs'].imports.pop()],
  ['runtime external redirected', m => (m.outputs['m4-runtime.cjs'].imports[0].path = 'malicious')],
])
  test(name + ' is refused', () => {
    const m = meta();
    change(m);
    assert.throws(() => verifyM4Metafile(m, contract), /M4 runtime closure refused/);
  });
function owned(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-seal-test-'));
  try {
    fs.writeFileSync(path.join(root, 'module.mjs'), 'export const fixed = 1;');
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('same image seals identically', () =>
  owned(root => {
    const before = sealM4Image(root);
    assert.equal(assertM4ImageUnchanged(root, before).digest, before.digest);
  }));
for (const [name, change] of [
  [
    'package/source edit',
    root => fs.writeFileSync(path.join(root, 'module.mjs'), 'export const fixed=2;'),
  ],
  ['new module', root => fs.writeFileSync(path.join(root, 'extra.mjs'), '')],
  ['mode change', root => fs.chmodSync(path.join(root, 'module.mjs'), 0o700)],
  ['removed source', root => fs.unlinkSync(path.join(root, 'module.mjs'))],
])
  test(name + ' invalidates postexecution image', () =>
    owned(root => {
      const before = sealM4Image(root);
      change(root);
      assert.throws(() => assertM4ImageUnchanged(root, before), /M4 runtime image refused/);
    })
  );
test('escaping symlink is refused', () =>
  owned(root => {
    fs.symlinkSync(os.tmpdir(), path.join(root, 'escape'));
    assert.throws(() => sealM4Image(root), /escaping link/);
  }));
test('writable home cannot contain alternate input', () =>
  owned(root => {
    fs.mkdirSync(path.join(root, 'home'));
    fs.writeFileSync(path.join(root, 'home', 'loader.mjs'), '');
    assert.throws(() => sealM4Image(root), /unexpected writable image input/);
  }));
