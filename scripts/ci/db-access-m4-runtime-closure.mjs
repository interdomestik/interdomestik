import { createHash } from 'node:crypto';
import { deriveM4DatabaseTlsSource } from './db-access-m4-database-tls-source.mjs';
import { exact } from './db-access-provider-runtime-identity.mjs';
const fail = reason => {
  throw Error('M4 runtime closure refused: ' + reason);
};
// Only these already authenticated source roles supply the approved TLS source law.
export const M4_RUNTIME_TLS_SOURCE_FILES = Object.freeze({
  postureSource: 'apps/web/src/server/operations/m4-pool-posture.ts',
  bootstrapSource: 'apps/web/src/server/operations/m4-private-runtime.ts',
  notificationRuntimeSource: 'apps/web/src/server/operations/m4-notification-runtime.ts',
});
export function verifyM4RuntimeTlsSourceRoot(sourceRoot, contract) {
  const sources = Object.fromEntries(
    Object.entries(M4_RUNTIME_TLS_SOURCE_FILES).map(([role, file]) => {
      const descriptor = contract?.files?.[file];
      if (!descriptor) fail('missing exact TLS source binding');
      return [role, exact(sourceRoot, file, descriptor).toString('utf8')];
    })
  );
  return verifyM4RuntimeTlsSources(sources);
}
export function verifyM4RuntimeTlsSources(sources) {
  if (
    !sources ||
    JSON.stringify(Object.keys(sources).sort()) !==
      JSON.stringify(Object.keys(M4_RUNTIME_TLS_SOURCE_FILES).sort()) ||
    Object.values(sources).some(text => typeof text !== 'string')
  )
    fail('missing exact TLS source bindings');
  try {
    const bootstrap = deriveM4DatabaseTlsSource({
      postureSource: sources.postureSource,
      poolSource: sources.bootstrapSource,
      poolRole: 'bootstrap',
    });
    const notification = deriveM4DatabaseTlsSource({
      postureSource: sources.postureSource,
      poolSource: sources.notificationRuntimeSource,
      poolRole: 'notification',
    });
    return Object.freeze({
      version: 1,
      sourcePremiseOnly: true,
      runtimeAdmission: false,
      bootstrapFactsSha256: bootstrap.factsSha256,
      notificationFactsSha256: notification.factsSha256,
    });
  } catch {
    fail('approved captured-endpoint TLS source law');
  }
}
// Metafile records cannot reveal named members or computed loads. The materializer
// separately invokes the approved exact-source law above before copying/compiling.
function validateTlsInputEdges(metafile, contract) {
  const importer = 'apps/web/src/server/operations/m4-pool-posture.ts';
  if (
    !Object.hasOwn(metafile.inputs, importer) ||
    contract.externalSpecifiers.filter(name => name === 'node:tls').length !== 1 ||
    contract.outputExternalSpecifiers.filter(name => name === 'node:tls').length !== 1
  )
    fail('exact Node TLS contract member');
  for (const [file, record] of Object.entries(metafile.inputs)) {
    const edges = (record.imports ?? []).filter(row => row.path === 'node:tls');
    if (
      edges.length !== (file === importer ? 1 : 0) ||
      edges.some(row => row.external !== true || row.kind !== 'import-statement')
    )
      fail('posture-only static Node TLS input edge');
  }
}
function validateTlsOutputEdge(imports) {
  const edges = imports.filter(row => row.path === 'node:tls');
  if (edges.length !== 1 || edges[0].external !== true || edges[0].kind !== 'require-call')
    fail('one fixed CJS Node TLS output edge');
}
function validateCacheObserverEdges(metafile, contract) {
  const observer = 'db-access-m4-runtime-cache-observer.ts';
  const adapters = [
    'apps/web/src/server/operations/m4-qualification-admin-assignment.ts',
    'apps/web/src/server/operations/m4-qualification-agent-assignment.ts',
    'apps/web/src/server/operations/m4-qualification-staff-assignment.ts',
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
  validateTlsInputEdges(metafile, contract);
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
  validateTlsOutputEdge(actual);
  if (
    actual.some(x => !x.external || !allowed.has(x.path)) ||
    JSON.stringify([...new Set(actual.map(x => x.path))].sort()) !==
      JSON.stringify(contract.outputExternalSpecifiers)
  )
    fail('exact output external set');
  return createHash('sha256').update(JSON.stringify(metafile)).digest('hex');
}
