import { M4_RUNTIME_CONTRACT } from './db-access-m4-runtime-contract.mjs';
import { bindM4OracleSource } from './db-access-m4-oracle-source-bindings.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { verifyM4ProofSource, isVerifiedM4ProofSource } from './db-access-m4-proof-source.mjs';
import { deriveM4MountedSource, bindMountedSourceImage } from './db-access-m4-mounted-source.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('actual producer registry and source policy authenticate and derive together', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const sources = new Map(
    Object.keys(PROVIDER_UNIT_POLICY.m4Proof.sources).map(file => [
      file,
      fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8'),
    ])
  );
  const parsed = new Map(
    [...sources]
      .filter(([file]) => !file.endsWith('.json'))
      .map(([file, text]) => [
        file,
        ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
      ])
  );
  const proof = verifyM4ProofSource(root, { sources, parsed }, PROVIDER_UNIT_POLICY);
  assert.equal(isVerifiedM4ProofSource(proof), true);
  assert.equal(proof.derivations.mountedAssignment.nextActionIngressQualified, false);
  assert.equal(proof.runtimeAdmission, false);
});
function shape(node) {
  const children = [];
  ts.forEachChild(node, child => {
    children.push(shape(child));
  });
  return [node.kind, children.length ? children : (node.text ?? null)];
}
// Parser/projection counterproofs only: these snippets are not a production source contract.
function fixture() {
  const profiles = ['legacy-admin', 'legacy-agent', 'staff'];
  const sources = {},
    files = [],
    routes = [];
  for (const [i, profile] of profiles.entries()) {
    const file = 'adapter-' + i + '.ts',
      text = 'export function invoke() { return relay(' + i + '); }';
    const unit = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const call = unit.statements[0].body.statements[0].expression;
    sources[file] = text;
    files.push({
      file,
      sha256: hash(text),
      astSha256: hash(JSON.stringify(shape(unit))),
      executionRequired: true,
    });
    routes.push({
      profile,
      witnessId: 'witness-' + i,
      calls: [{ file, astSha256: hash(JSON.stringify(shape(call))) }],
    });
  }
  return {
    sources,
    fixed: {
      version: 1,
      reviewedConstruction: 'local-qualification-assignment-three-profile-v1',
      qualificationScope: 'local-adapters-only-no-next-ingress',
      files,
      routes,
      replacements: [],
    },
  };
}
function bound() {
  const f = fixture(),
    derivation = deriveM4MountedSource(f.sources, f.fixed);
  const source = {
    policyDigest: 'policy',
    sourceRecords: Object.fromEntries(f.fixed.files.map(row => [row.file, { sha256: row.sha256 }])),
  };
  const runtime = { contextSha256: 'context', reportSha256: 'report', imageDigest: 'image' };
  const contract = structuredClone(M4_RUNTIME_CONTRACT);
  const transforms = contract.qualificationTransforms;
  runtime.fixedContractSha256 = hash(JSON.stringify(contract));
  runtime.bundleSha256 = hash('bundle');
  runtime.metafileSha256 = hash('meta');
  runtime.qualificationCompilation = {
    kind: 'fixed-qualification-cache-transform',
    transforms,
    metafileSha256: runtime.metafileSha256,
    bundleSha256: runtime.bundleSha256,
    scope: 'revalidation-call-observation-only',
  };
  const policy = {
    producerFiles: {
      'scripts/ci/db-access-m4-runtime-cache-observer.ts': { sha256: hash('observer') },
    },
  };
  const records = structuredClone(source.sourceRecords);
  records['db-access-m4-runtime-cache-observer.ts'] = { sha256: hash('observer') };
  const witnesses = derivation.routes.map((route, i) => ({
    id: route.witnessId,
    executionObserved: true,
    fact: {
      path: '/derivations/mountedAssignment/routes/' + i,
      sha256: hash(JSON.stringify(route)),
    },
  }));
  return { derivation, source, runtime, records, witnesses, contract, policy };
}
test('source/AST calls and exact executed-image links bind', () => {
  const x = bound();
  const result = bindMountedSourceImage(
    x.derivation,
    x.source,
    x.runtime,
    x.records,
    x.witnesses,
    x.contract,
    x.policy
  );
  assert.equal(result.witnesses.length, 3);
  assert.equal(result.runtimeReportSha256, 'report');
  assert.ok(result.routes.every(row => row.calls[0].locator.length === 4));
});
for (const [label, mutate] of [
  ['foreign live-ingress claim', f => (f.fixed.qualificationScope = 'production-next')],
  ['fabricated removed invocation', f => f.fixed.replacements.push({ file: 'live.ts' })],
  [
    'changed source call',
    f => (f.sources['adapter-0.ts'] = f.sources['adapter-0.ts'].replace('relay(0)', 'foreign(0)')),
  ],
  ['missing source', f => delete f.sources['adapter-0.ts']],
  ['foreign profile', f => (f.fixed.routes[0].profile = 'ops')],
  ['unknown call AST', f => (f.fixed.routes[0].calls[0].astSha256 = '0'.repeat(64))],
])
  test(label + ' refuses', () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => deriveM4MountedSource(f.sources, f.fixed));
  });
for (const [label, mutate] of [
  ['missing compiler premise', x => delete x.runtime.qualificationCompilation],
  [
    'foreign compiler bundle',
    x => (x.runtime.qualificationCompilation.bundleSha256 = hash('foreign')),
  ],
  ['wider cache alias', x => x.contract.qualificationTransforms.importers.push('other.ts')],
  [
    'foreign cache observer',
    x => (x.records['db-access-m4-runtime-cache-observer.ts'].sha256 = hash('foreign')),
  ],
  ['missing executed image', x => delete x.records['adapter-0.ts']],
  ['foreign native bytes', x => (x.source.sourceRecords['adapter-0.ts'].sha256 = 'foreign')],
  ['unexecuted oracle', x => (x.witnesses[0].executionObserved = false)],
  ['foreign route fact', x => (x.witnesses[0].fact.sha256 = 'foreign')],
  ['duplicate oracle link', x => x.witnesses.push(x.witnesses[0])],
])
  test(label + ' refuses', () => {
    const x = bound();
    mutate(x);
    assert.throws(() =>
      bindMountedSourceImage(
        x.derivation,
        x.source,
        x.runtime,
        x.records,
        x.witnesses,
        x.contract,
        x.policy
      )
    );
  });

test('fixed Next source-only binding does not claim image execution or waive another file', () => {
  const file = 'apps/web/src/actions/admin-claims.core.ts';
  const row = { file, sha256: hash('source'), executionRequired: false };
  const source = {
    sourceRecords: { [file]: { sha256: row.sha256 } },
    derivations: { mountedAssignment: { sourceRecords: [row] } },
  };
  const result = bindM4OracleSource(source, {}, file);
  assert.equal(result.binding, 'native-mounted-source-only');
  assert.equal(result.executedImageBinding, false);
  assert.equal(result.nextDeploymentQualified, false);
  row.executionRequired = true;
  assert.throws(() => bindM4OracleSource(source, {}, file));
  row.executionRequired = false;
  const foreign = 'arbitrary.ts';
  source.sourceRecords[foreign] = { sha256: row.sha256 };
  source.derivations.mountedAssignment.sourceRecords.push({ ...row, file: foreign });
  assert.throws(() => bindM4OracleSource(source, {}, foreign));
});
