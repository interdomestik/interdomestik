import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { M4_COMPILED_RUNTIME_CONTRACT as contract } from './db-access-m4-compiled-runtime-contract.mjs';

// Exact finite compiler graph, including edge order and repeated external edges.
// Hash matching alone is not the source semantic derivation used by the outer producer.
export function verifyM4CompiledBackendMetafile(meta) {
  assert.deepEqual(
    Object.keys(meta.inputs).sort(),
    Object.keys(contract.expectedInputImports).sort()
  );
  for (const [file, imports] of Object.entries(contract.expectedInputImports)) {
    assert.deepEqual(meta.inputs[file].imports, imports, 'Strict ESM input edges changed: ' + file);
    assert(Number.isSafeInteger(meta.inputs[file].bytes) && meta.inputs[file].bytes > 0);
  }
  assert.deepEqual(Object.keys(meta.outputs), [contract.outputFile]);
  const output = meta.outputs[contract.outputFile];
  assert.equal(output.entryPoint, contract.entryFile);
  assert.deepEqual(output.exports, contract.outputExports);
  assert.deepEqual(output.imports, contract.outputImports);
  assert(output.imports.every(row => row.external && row.kind === 'import-statement'));
  assert(output.imports.some(row => row.path === 'node:tls'));
  assert(Object.keys(output.inputs).every(file => Object.hasOwn(meta.inputs, file)));
  assert(!JSON.stringify(meta).includes('cache-observer'));
  return createHash('sha256').update(JSON.stringify(meta)).digest('hex');
}
