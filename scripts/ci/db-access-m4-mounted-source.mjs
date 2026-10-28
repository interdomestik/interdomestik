// Exact reviewed source-image derivation, not a general call-graph theorem.
import { createHash } from 'node:crypto';
import ts from 'typescript';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Error('M4 mounted source refused: ' + reason);
};
function shape(node) {
  const children = [];
  ts.forEachChild(node, value => {
    children.push(shape(value));
  });
  return [node.kind, children.length ? children : (node.text ?? null)];
}
function locator(node, file) {
  return [file, node.pos, node.end, node.kind];
}
export function deriveM4MountedSource(sources, fixed) {
  if (
    fixed.version !== 1 ||
    fixed.reviewedConstruction !== 'local-qualification-assignment-three-profile-v1' ||
    fixed.qualificationScope !== 'local-adapters-only-no-next-ingress' ||
    !Array.isArray(fixed.replacements) ||
    fixed.replacements.length !== 0 ||
    !Array.isArray(fixed.files) ||
    !Array.isArray(fixed.routes)
  )
    fail('fixed contract');
  if (
    JSON.stringify(Object.keys(sources).sort()) !==
    JSON.stringify(fixed.files.map(row => row.file).sort())
  )
    fail('exact source closure');
  const units = new Map(),
    records = [];
  for (const record of fixed.files) {
    const text = sources[record.file],
      unit = ts.createSourceFile(record.file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (
      unit.parseDiagnostics.length ||
      hash(text) !== record.sha256 ||
      hash(JSON.stringify(shape(unit))) !== record.astSha256
    )
      fail('reviewed exact source/AST');
    units.set(record.file, unit);
    records.push({
      file: record.file,
      sha256: record.sha256,
      executionRequired: record.executionRequired,
    });
  }
  const routes = fixed.routes.map(route => {
    const calls = route.calls.map(required => {
      const unit = units.get(required.file);
      if (!unit) fail('call source');
      const found = [];
      function visit(node) {
        if (ts.isCallExpression(node) && hash(JSON.stringify(shape(node))) === required.astSha256)
          found.push(node);
        ts.forEachChild(node, visit);
      }
      visit(unit);
      if (found.length !== 1) fail('unique exact reviewed call');
      const call = found[0];
      return { ...required, locator: locator(call, required.file) };
    });
    if (!calls.length) fail('missing mounted route');
    return { ...route, calls };
  });
  if (
    JSON.stringify(routes.map(row => row.profile)) !==
    JSON.stringify(['legacy-admin', 'legacy-agent', 'staff'])
  )
    fail('three literal profiles');
  return {
    kind: 'fixed-local-qualification-assignment-source',
    qualificationScope: 'local-adapters-only-no-next-ingress',
    localQualificationOnly: true,
    nextActionIngressQualified: false,
    routes,
    sourceFiles: records.map(row => row.file),
    sourceRecords: records,
    replacements: fixed.replacements,
    contractDigest: hash(JSON.stringify(fixed)),
  };
}
export function bindMountedSourceImage(
  derivation,
  source,
  runtime,
  imageRecords,
  witnesses,
  contract,
  policy
) {
  const compilation = bindCompilation(runtime, imageRecords, contract, policy);
  for (const record of derivation.sourceRecords) {
    if (
      typeof record.executionRequired !== 'boolean' ||
      source.sourceRecords[record.file]?.sha256 !== record.sha256
    )
      fail('same native mounted source');
    if (record.executionRequired && imageRecords[record.file]?.sha256 !== record.sha256)
      fail('same executed adapter/relay/owner source');
  }
  const selected = derivation.routes.map((route, index) => {
    const found = witnesses.filter(link => link.id === route.witnessId);
    if (
      found.length !== 1 ||
      found[0].executionObserved !== true ||
      found[0].fact.path !== '/derivations/mountedAssignment/routes/' + index ||
      found[0].fact.sha256 !== hash(JSON.stringify(route))
    )
      fail('fixed mounted assertion program');
    return { ...found[0], profile: route.profile };
  });
  return {
    ...derivation,
    witnesses: selected,
    qualificationCompilation: compilation,
    sourcePolicyDigest: source.policyDigest,
    contextSha256: runtime.contextSha256,
    runtimeReportSha256: runtime.reportSha256,
    imageDigest: runtime.imageDigest,
  };
}

function bindCompilation(runtime, records, contract, policy) {
  const target = 'db-access-m4-runtime-cache-observer.ts';
  const transforms = {
    kind: 'fixed-cache-call-observer',
    specifier: 'next/cache',
    target,
    importers: [
      'apps/web/src/server/operations/m4-qualification-admin-assignment.ts',
      'apps/web/src/server/operations/m4-qualification-agent-assignment.ts',
      'apps/web/src/server/operations/m4-qualification-staff-assignment.ts',
    ],
    scope: 'revalidation-call-observation-only',
  };
  const value = runtime.qualificationCompilation;
  if (
    !value ||
    value.kind !== 'fixed-qualification-cache-transform' ||
    value.scope !== 'revalidation-call-observation-only' ||
    JSON.stringify(value.transforms) !== JSON.stringify(transforms) ||
    JSON.stringify(contract.qualificationTransforms) !== JSON.stringify(transforms) ||
    runtime.fixedContractSha256 !== hash(JSON.stringify(contract)) ||
    value.metafileSha256 !== runtime.metafileSha256 ||
    value.bundleSha256 !== runtime.bundleSha256 ||
    !/^[a-f0-9]{64}$/.test(value.metafileSha256) ||
    !/^[a-f0-9]{64}$/.test(value.bundleSha256) ||
    !records[target] ||
    records[target].sha256 !== policy.producerFiles['scripts/ci/' + target]?.sha256
  )
    fail('actual fixed qualification compiler transform');
  return { ...value, observerSha256: records[target].sha256, nextDeploymentQualified: false };
}
