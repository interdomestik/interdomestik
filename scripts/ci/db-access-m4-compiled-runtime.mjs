import {
  assertM4CompiledModuleAdmission,
  assertM4CompiledInvocation,
} from './db-access-m4-compiled-producer-loader.mjs';
assertM4CompiledModuleAdmission(import.meta.url);
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const fresh = new WeakMap();
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const fail = reason => {
  throw Error('M4 compiled execution refused: ' + reason);
};
export const isFreshM4CompiledRuntimeResult = value => fresh.has(value);
export function hasM4CompiledRuntimeBinding(value, context, policySha256) {
  const record = fresh.get(value);
  return Boolean(
    record && record.contextSha256 === digest(context) && record.policySha256 === policySha256
  );
}
export function assertM4CompiledRuntimeImageRecords(value, context, policySha256) {
  if (!hasM4CompiledRuntimeBinding(value, context, policySha256))
    fail('foreign execution/image object');
  return fresh.get(value).imageRecords;
}

export function takeM4CompiledRuntimeForJoin(value, context, policySha256) {
  if (!hasM4CompiledRuntimeBinding(value, context, policySha256))
    fail('foreign or consumed compiled execution');
  const record = fresh.get(value);
  fresh.delete(value);
  return Object.freeze({ result: value, imageRecords: record.imageRecords });
}

// No result, proof object, callback, evaluator or platform override is an argument.
export async function runM4CompiledRuntime(
  {
    candidate,
    producer,
    assembly,
    tarballRoot,
    output,
    databaseUrl,
    databaseTLS,
    compiledPackageRoot,
    gitDir,
    context,
  },
  admission
) {
  const { startedAt, deadlineAt } = assertM4CompiledInvocation(
    admission,
    import.meta.url,
    producer,
    context
  );
  const started = startedAt;
  const own = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  if (fs.realpathSync(producer) !== own) fail('producer module root');
  const capturedContext = freeze(JSON.parse(JSON.stringify(context)));
  const capturedDatabaseTLS = freeze(structuredClone(databaseTLS));
  const { authenticateRuntimeContext, snapshot } =
    await import('./db-access-provider-runtime-identity.mjs');
  const { providerRuntimeProducerRecords } =
    await import('./db-access-provider-runtime-producer-records.mjs');
  const { PROVIDER_UNIT_POLICY: policy } = await import('./db-access-provider-unit-policy.mjs');
  const { M4_COMPILED_RUNTIME_CONTRACT: contract, M4_COMPILED_PRODUCER_FILES } =
    await import('./db-access-m4-compiled-runtime-contract.mjs');
  const { deriveM4CompiledFixtureSource } = await import('./db-access-m4-compiled-source.mjs');
  const { deriveM4StrictObservationSource } =
    await import('./db-access-m4-strict-observation-source.mjs');
  const { materializeM4CompiledBackend } = await import('./db-access-m4-compiled-materialize.mjs');
  const { assertM4ImageUnchanged } = await import('./db-access-m4-runtime-seal.mjs');
  const compiledSource = JSON.parse(
    fs.readFileSync(path.join(producer, 'scripts/ci/db-access-m4-compiled-contract.json'))
  );
  const records = {};
  for (const bank of [
    contract.files,
    contract.configuration,
    contract.migrations,
    compiledSource.candidateFiles,
    policy.resolverFiles,
  ])
    for (const [file, record] of Object.entries(bank)) {
      if (
        records[file] &&
        ['sha256', 'bytes', 'mode'].some(key => records[file][key] !== record[key])
      )
        fail('conflicting source record');
      records[file] = record;
    }
  for (const name of [...M4_COMPILED_PRODUCER_FILES, ...contract.childFiles])
    if (!Object.hasOwn(policy.producerFiles, 'scripts/ci/' + name))
      fail('missing fixed compiled producer descriptor');
  const producerRecords = providerRuntimeProducerRecords(policy, producer);
  const git = authenticateRuntimeContext(gitDir, capturedContext);
  const bookend = () => ({
    candidate: snapshot(candidate, capturedContext.candidateCommit, records, git),
    producer: snapshot(producer, capturedContext.sourceCommit, producerRecords, git),
  });
  const before = bookend();
  const sourceDerivation = deriveM4CompiledFixtureSource({
    candidateRoot: candidate,
    producerRoot: producer,
  });
  const source = name =>
    fs.readFileSync(path.join(candidate, 'apps/web/src/server/operations/' + name), 'utf8');
  const strictSourceDerivation = deriveM4StrictObservationSource({
    runtimeSource: source('m4-private-runtime.ts'),
    contextSource: source('m4-private-runtime-context.ts'),
    ownerSource: source('m4-assignment-owner.ts'),
    listenerSource: source('m4-assignment-owner-http.ts'),
    commandSource: source('m4-runtime-command.ts'),
    retirementSource: source('m4-runtime-retirement.ts'),
    ownerCaptureSource: source('m4-assignment-owner-capture.ts'),
  });
  const image = materializeM4CompiledBackend({
    sourceRoot: candidate,
    producerRoot: producer,
    outputRoot: assembly,
    tarballRoot,
    policy,
    deadlineAt,
  });
  const workRoot = path.join(fs.realpathSync(assembly), 'm4-compiled-platform');
  fs.mkdirSync(workRoot, { mode: 0o700 });
  const remaining = Math.floor(deadlineAt - performance.now());
  if (remaining <= 0) fail('budget exhausted before actual execution');
  const { executeM4CompiledDriver } = await import('./db-access-m4-compiled-driver-channel.mjs');
  const { validateM4CompiledDriverCompletion } =
    await import('./db-access-m4-compiled-completion.mjs');
  const { persistM4CompiledReview } = await import('./db-access-m4-compiled-persist.mjs');
  const driver = await executeM4CompiledDriver({
    root: image.root,
    deadlineAt,
    input: {
      databaseUrl,
      databaseTLS: capturedDatabaseTLS,
      compiledPackageRoot,
      producerRoot: producer,
      candidateRoot: candidate,
      workRoot,
      gitDir,
      context: capturedContext,
      candidateRecords: records,
      producerRecords,
      sourceBefore: before,
      imageDigest: image.image.digest,
    },
  });
  const completion = validateM4CompiledDriverCompletion(driver, before, image.image.digest);
  const afterImage = assertM4ImageUnchanged(image.root, image.image);
  authenticateRuntimeContext(gitDir, capturedContext);
  const after = bookend();
  assert.deepEqual(after, before);
  if (performance.now() > deadlineAt) fail('budget exhausted in final bookends');
  const value = freeze({
    version: 1,
    kind: 'fresh-strict-compiled-runtime',
    completion,
    sourceDerivation: freeze({
      ...sourceDerivation,
      vendorCorrespondence: compiledSource.vendorCorrespondence.map(row => ({
        ...row,
        candidateDescriptor: structuredClone(compiledSource.candidateFiles[row.candidate]),
        producerDescriptor: structuredClone(compiledSource.projectFiles[row.producer]),
      })),
    }),
    strictSourceDerivation,
    sourceBookends: { before, after },
    contextSha256: digest(capturedContext),
    policySha256: digest(policy),
    fixedContractSha256: digest(contract),
    imageDigest: afterImage.digest,
    bundleSha256: image.bundleSha256,
    metafileSha256: image.metafileSha256,
    dependencyGraphSha256: image.installed.lock.graphSha256,
    reportSha256: digest(completion),
    elapsedMs: performance.now() - started,
    runtimeAdmission: false,
    nativeAdmission: false,
    allExecutableContextsQualified: false,
    hostedQualification: false,
    productionCCredit: 0,
  });
  persistM4CompiledReview(output, assembly, value);
  if (performance.now() > deadlineAt) fail('budget exhausted before private enrollment');
  fresh.set(value, {
    contextSha256: value.contextSha256,
    policySha256: value.policySha256,
    imageRecords: freeze(afterImage.records),
  });
  return value;
}
