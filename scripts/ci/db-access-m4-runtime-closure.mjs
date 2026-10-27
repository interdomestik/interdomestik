import { createHash } from 'node:crypto';
const fail = reason => {
  throw Error('M4 runtime closure refused: ' + reason);
};
function validateCacheObserverEdges(metafile, contract) {
  const observer = 'db-access-m4-runtime-cache-observer.ts';
  const adapters = [
    'apps/web/src/actions/admin-claims/assign.core.ts',
    'apps/web/src/actions/agent-claims/assign.core.ts',
    'apps/web/src/actions/staff-claims/assign.core.ts',
  ];
  const expected = {
    kind: 'fixed-cache-call-observer',
    specifier: 'next/cache',
    target: observer,
    importers: adapters,
    scope: 'revalidation-call-observation-only',
  };
  if (JSON.stringify(contract.qualificationTransforms) !== JSON.stringify(expected))
    fail('exact cache observer transform');
  const permitted = new Set([contract.entryFile, ...adapters]);
  for (const [file, record] of Object.entries(metafile.inputs)) {
    const edges = (record.imports ?? []).filter(row => row.path === observer);
    if (edges.length !== (permitted.has(file) ? 1 : 0) || edges.some(row => row.external))
      fail('exact cache observer edge');
  }
  if ([...permitted, observer].some(file => !Object.hasOwn(metafile.inputs, file)))
    fail('missing cache observer participant');
}
export function verifyM4Metafile(metafile, contract) {
  const inputs = Object.keys(metafile.inputs ?? {}).sort(),
    expected = [contract.entryFile, ...contract.expectedInputs].sort();
  if (
    new Set(expected).size !== expected.length ||
    JSON.stringify(inputs) !== JSON.stringify(expected)
  )
    fail('exact input set');
  validateCacheObserverEdges(metafile, contract);
  const allowed = new Set(contract.externalSpecifiers);
  for (const [file, record] of Object.entries(metafile.inputs))
    for (const imported of record.imports ?? []) {
      if (imported.external) {
        if (
          !allowed.has(imported.path) &&
          !(contract.erasedTypeImports?.[file] ?? []).includes(imported.path)
        )
          fail('external import');
      } else if (!Object.hasOwn(metafile.inputs, imported.path)) fail('unresolved internal edge');
    }
  const outputs = Object.entries(metafile.outputs ?? {});
  if (
    outputs.length !== 1 ||
    outputs[0][0] !== 'm4-runtime.cjs' ||
    outputs[0][1].entryPoint !== contract.entryFile
  )
    fail('fixed output');
  const actual = outputs[0][1].imports ?? [];
  if (
    actual.some(x => !x.external || !allowed.has(x.path)) ||
    JSON.stringify([...new Set(actual.map(x => x.path))].sort()) !==
      JSON.stringify(contract.outputExternalSpecifiers)
  )
    fail('exact output external set');
  return createHash('sha256').update(JSON.stringify(metafile)).digest('hex');
}
