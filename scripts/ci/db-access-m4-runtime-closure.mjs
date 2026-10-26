import { createHash } from 'node:crypto';
const fail = reason => {
  throw Error('M4 runtime closure refused: ' + reason);
};
export function verifyM4Metafile(metafile, contract) {
  const inputs = Object.keys(metafile.inputs ?? {}).sort(),
    expected = [contract.entryFile, ...contract.expectedInputs].sort();
  if (
    new Set(expected).size !== expected.length ||
    JSON.stringify(inputs) !== JSON.stringify(expected)
  )
    fail('exact input set');
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
