import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  authenticateRuntimeContext,
  snapshot,
  safeEnv,
  hash,
} from './db-access-provider-runtime-identity.mjs';
import { providerRuntimeProducerRecords } from './db-access-provider-runtime-producer-records.mjs';
import { PROVIDER_UNIT_POLICY as policy } from './db-access-provider-unit-policy.mjs';
import { M4_RUNTIME_CONTRACT as contract } from './db-access-m4-runtime-contract.mjs';
import { materializeM4Runtime } from './db-access-m4-runtime-materialize.mjs';
import { assertM4ImageUnchanged } from './db-access-m4-runtime-seal.mjs';
import { validateM4RuntimeCompletion } from './db-access-m4-runtime-result.mjs';
const fresh = new WeakMap();
const fail = reason => {
  throw Error('M4 required execution refused: ' + reason);
};
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
export const isFreshM4RuntimeResult = value => fresh.has(value);
// Consumers must retain this exact same-process object. Public JSON never reconstructs it.
export function hasM4RuntimeBinding(value, context, policySha256) {
  const binding = fresh.get(value);
  return Boolean(
    binding &&
    binding.contextSha256 === hash(JSON.stringify(context)) &&
    binding.policySha256 === policySha256
  );
}
export function m4RuntimeCandidateRecords() {
  const records = { ...contract.files, ...contract.configuration, ...contract.migrations };
  for (const [file, record] of Object.entries(policy.resolverFiles)) {
    const prior = records[file];
    if (prior && ['sha256', 'bytes', 'mode'].some(key => prior[key] !== record[key]))
      fail('conflicting candidate record');
    records[file] = record;
  }
  return records;
}
export function runM4Runtime({
  candidate,
  producer,
  assembly,
  tarballRoot,
  output,
  databaseUrl,
  gitDir,
  context,
}) {
  const started = performance.now();
  const own = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  if (fs.realpathSync(producer) !== own) fail('producer module root');
  if (contract.fixturePortComplete !== true) fail('fixed fixture port not sealed');
  const target = new URL(databaseUrl);
  if (
    target.protocol !== 'postgresql:' ||
    target.hostname !== '127.0.0.1' ||
    !['5432', '55438'].includes(target.port) ||
    target.pathname !== '/interdomestik_test' ||
    target.username !== 'postgres' ||
    !target.password ||
    target.search ||
    target.hash
  )
    fail('owned administrator target');
  const records = m4RuntimeCandidateRecords(),
    producerRecords = providerRuntimeProducerRecords(policy, producer);
  const git = authenticateRuntimeContext(gitDir, context);
  git.readBlob = oid =>
    execFileSync(
      '/usr/bin/git',
      ['--no-replace-objects', '--git-dir', gitDir, 'cat-file', 'blob', oid],
      { env: safeEnv, maxBuffer: 32 * 1024 * 1024, timeout: 30000 }
    );
  const before = {
    candidate: snapshot(candidate, context.candidateCommit, records, git),
    producer: snapshot(producer, context.sourceCommit, producerRecords, git),
  };
  const materialized = materializeM4Runtime({
    sourceRoot: candidate,
    producerRoot: producer,
    outputRoot: assembly,
    tarballRoot,
    policy,
  });
  const remaining = Math.floor(300000 - (performance.now() - started));
  if (remaining <= 0) fail('shared lane budget exhausted in materialization');
  const child = spawnSync(process.execPath, ['db-access-m4-runtime-driver.mjs'], {
    cwd: materialized.root,
    shell: false,
    detached: true,
    encoding: 'utf8',
    timeout: remaining,
    killSignal: 'SIGKILL',
    maxBuffer: 2 * 1024 * 1024,
    env: {
      PATH: '/usr/bin:/bin',
      HOME: path.join(materialized.root, 'home'),
      TMPDIR: path.join(materialized.root, 'tmp'),
      TZ: 'UTC',
      LANG: 'C.UTF-8',
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
    },
  });
  // The administrator URL exists only in this trusted fixture driver; its child uses a clean env.
  if (child.error || child.signal || child.status !== 0) {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }
    fail('actual child execution or termination');
  }
  const completionFile = path.join(materialized.root, 'results/m4-completion.json');
  const stat = fs.lstatSync(completionFile);
  if (
    !stat.isFile() ||
    fs.realpathSync(completionFile) !== completionFile ||
    stat.size > 1024 * 1024
  )
    fail('completion file');
  const bytes = fs.readFileSync(completionFile),
    completion = validateM4RuntimeCompletion(JSON.parse(bytes));
  const imageAfter = assertM4ImageUnchanged(materialized.root, materialized.image);
  authenticateRuntimeContext(gitDir, context);
  const after = {
    candidate: snapshot(candidate, context.candidateCommit, records, git),
    producer: snapshot(producer, context.sourceCommit, producerRecords, git),
  };
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('source/event bookends');
  if (performance.now() - started > 300000) fail('shared lane budget exhausted in final checks');
  const value = freeze({
    version: 1,
    executed: true,
    completion,
    sourceBookends: { before, after },
    imageDigest: imageAfter.digest,
    fixedContractSha256: hash(JSON.stringify(contract)),
    dependencyGraphSha256: materialized.installed.lock.graphSha256,
    minimalOpsPrivilegeDiagnostic: structuredClone(JSON.parse(bytes).minimalOpsPrivilegeDiagnostic),
    contextSha256: hash(JSON.stringify(context)),
    policySha256: hash(JSON.stringify(policy)),
    reportSha256: hash(bytes),
    bundleSha256: materialized.bundleSha256,
    metafileSha256: materialized.metafileSha256,
    elapsedMs: performance.now() - started,
    runtimeAdmission: false,
    nativeAdmission: false,
    allExecutableContextsQualified: false,
  });
  fresh.set(value, {
    contextSha256: value.contextSha256,
    policySha256: value.policySha256,
    imageRecords: freeze(imageAfter.records),
  });
  fs.writeFileSync(
    path.join(output, 'm4-execution-summary.json'),
    JSON.stringify(value, null, 2) + '\n'
  );
  return value;
}
