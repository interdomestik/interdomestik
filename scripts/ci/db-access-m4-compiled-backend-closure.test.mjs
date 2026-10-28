import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { M4_COMPILED_RUNTIME_CONTRACT as c } from './db-access-m4-compiled-runtime-contract.mjs';
import { verifyM4CompiledBackendMetafile } from './db-access-m4-compiled-backend-closure.mjs';
import * as platform from './db-access-m4-compiled-platform.mjs';
function model() {
  return structuredClone({
    inputs: Object.fromEntries(
      Object.entries(c.expectedInputImports).map(([key, imports]) => [key, { bytes: 1, imports }])
    ),
    outputs: {
      [c.outputFile]: {
        entryPoint: c.entryFile,
        exports: c.outputExports,
        imports: c.outputImports,
        inputs: Object.fromEntries(
          Object.keys(c.expectedInputImports).map(key => [key, { bytesInOutput: 1 }])
        ),
      },
    },
  });
}
test('finite ESM grammar accepts exact graph including repeated import edges', () => {
  assert.match(verifyM4CompiledBackendMetafile(model()), /^[a-f0-9]{64}$/);
  assert(Object.isFrozen(c.expectedInputImports));
});
for (const [name, mutate] of [
  ['new module', m => (m.inputs['evil.mjs'] = { bytes: 1, imports: [] })],
  ['missing source module', m => delete m.inputs[Object.keys(m.inputs)[0]]],
  [
    'new side effect edge',
    m => m.inputs[c.entryFile].imports.push({ path: 'evil.mjs', kind: 'import-statement' }),
  ],
  [
    'CJS TLS fallback',
    m => (m.outputs[c.outputFile].imports.find(x => x.path === 'node:tls').kind = 'require-call'),
  ],
  ['changed export surface', m => m.outputs[c.outputFile].exports.push('registerProof')],
  ['dropped import multiplicity', m => m.outputs[c.outputFile].imports.pop()],
  [
    'next cache observer',
    m => (m.inputs['db-access-m4-runtime-cache-observer.ts'] = { bytes: 1, imports: [] }),
  ],
  ['second output', m => (m.outputs['other.mjs'] = m.outputs[c.outputFile])],
])
  test('refuses finite ESM graph mutant: ' + name, () => {
    const meta = model();
    mutate(meta);
    assert.throws(() => verifyM4CompiledBackendMetafile(meta));
  });
test('every actual platform seam refuses Boolean, descriptor and callback substitution', async () => {
  let called = false;
  const names = [
    'closeM4CompiledPlatform',
    'm4CompiledBackendLaunch',
    'prepareM4CompiledPlatform',
    'runM4CompiledBrowser',
    'startM4CompiledNext',
    'takeM4CompiledPlatformEvidence',
  ];
  assert.deepEqual(Object.keys(platform).sort(), names);
  for (const name of names) {
    const supplied = {
      checksPassed: true,
      strictTLSQualified: true,
      imageDigest: 'a'.repeat(64),
      deadlineAt: performance.now() + 1000,
      execute: () => {
        called = true;
      },
    };
    await assert.rejects(
      async () =>
        platform[name](supplied, { ownerOrigin: 'https://127.0.0.1:8443', plan: {}, cookies: {} }),
      name === 'prepareM4CompiledPlatform'
        ? /Exact public database CA required/u
        : /Foreign compiled platform handle/u,
      name
    );
    assert.equal(called, false, name + ' must never invoke a supplied executor');
  }
});
test('strict backend entry contains exactly the four concrete strict observation exports', () => {
  const source = fs.readFileSync(
    new URL('./db-access-m4-compiled-entry.ts', import.meta.url),
    'utf8'
  );
  const clauses = [...source.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gu)].map(
    match => ({
      names: match[1]
        .split(',')
        .map(name => name.trim())
        .filter(Boolean),
      module: match[2],
    })
  );
  assert.equal((source.match(/\bexport\b/gu) ?? []).length, 2);
  assert.deepEqual(clauses, [
    {
      names: ['startM4ObservedPrivateAssignmentOwner', 'takeM4StrictAssignmentOwnerContexts'],
      module: './apps/web/src/server/operations/m4-assignment-owner',
    },
    {
      names: ['createM4ObservedPrivateAssignmentRuntime', 'takeM4StrictAssignmentContexts'],
      module: './apps/web/src/server/operations/m4-private-runtime',
    },
  ]);
  assert.deepEqual(clauses.flatMap(clause => clause.names).sort(), [...c.outputExports].sort());
  assert(!/LocalQualification|cache-observer|register/.test(source));
});
