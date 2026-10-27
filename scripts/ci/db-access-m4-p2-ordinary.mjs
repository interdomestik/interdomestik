// Internal fixed producer adapter. Only an actual bootstrapped execution creates state.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  authenticateRuntimeContext,
  snapshot,
  hash,
} from './db-access-provider-runtime-identity.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { M4_P2_CLOSURE_FILES, assertM4P2ClosureNames } from './db-access-m4-p2-closure.mjs';

const ownerRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const states = new WeakMap();
const fail = reason => {
  throw Error('M4 ordinary P2 refused: ' + reason);
};
const contextKey = context => JSON.stringify(context);

function sourceCurrent(input, context) {
  if (input.producer !== ownerRoot || input.policy !== PROVIDER_UNIT_POLICY)
    fail('fixed producer/policy required');
  if (context.eventName !== 'pull_request') fail('common pull_request event required');
  const git = authenticateRuntimeContext(input.gitDir, context);
  const names = git([
    'ls-tree',
    '-r',
    '--name-only',
    context.sourceCommit,
    '--',
    'scripts/ci/p2/',
    ...M4_P2_CLOSURE_FILES.filter(file => !file.startsWith('scripts/ci/p2/')),
  ]).split('\n');
  assertM4P2ClosureNames(names);
  const records = Object.fromEntries(
    M4_P2_CLOSURE_FILES.map(file => {
      const expected = PROVIDER_UNIT_POLICY.producerFiles[file];
      if (!expected) fail('missing fixed producer descriptor ' + file);
      return [file, expected];
    })
  );
  return { git, digest: snapshot(input.producer, context.sourceCommit, records, git) };
}

function candidateCurrent(input, context, git, policy) {
  const sourceNames = [
    'apps/web/src/actions/admin-claims/assign.core.ts',
    'apps/web/src/actions/admin-claims/assign.wrapper.test.ts',
  ];
  const dispatchNames = [
    '.github/workflows/ci.yml',
    'apps/web/vitest.config.ts',
    'scripts/ci/clean-coverage-artifacts.mjs',
    'scripts/ci/coverage-gate.mjs',
  ];
  if (
    JSON.stringify(Object.keys(policy.sourceFiles).sort()) !== JSON.stringify(sourceNames.sort()) ||
    JSON.stringify(Object.keys(policy.dispatchFiles).sort()) !==
      JSON.stringify(dispatchNames.sort())
  )
    fail('fixed source/dispatch membership');
  const records = Object.fromEntries(
    Object.entries({ ...policy.sourceFiles, ...policy.dispatchFiles }).map(([file, sha256]) => {
      const full = path.join(input.candidate, file);
      if (!fs.lstatSync(full).isFile() || fs.realpathSync(full) !== full)
        fail('candidate file kind');
      return [file, { mode: '100644', bytes: fs.statSync(full).size, sha256 }];
    })
  );
  return snapshot(input.candidate, context.candidateCommit, records, git);
}

function ordinaryIdentity() {
  // Locators only; the existing fixed GitHub artifact reader authenticates their event/job.
  const values = [process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT];
  if (
    values.some(value => !/^[1-9][0-9]*$/.test(value ?? '') || !Number.isSafeInteger(Number(value)))
  )
    fail('fixed ordinary workflow run/attempt locators');
  return { ordinaryRunId: Number(values[0]), ordinaryRunAttempt: Number(values[1]) };
}

export async function runFixedM4P2(input) {
  const context = Object.freeze(structuredClone(input.context));
  const before = sourceCurrent(input, context);
  const policy = JSON.parse(
    fs.readFileSync(path.join(input.producer, 'scripts/ci/p2/policy.json'), 'utf8')
  );
  if (policy.qualification !== 'QUALIFIED_LINUX_ARM64_COVERAGE')
    fail('current Linux closure/image qualification is still held');
  const candidateBefore = candidateCurrent(input, context, before.git, policy);
  const output = fs.realpathSync(input.output);
  if (
    output !== input.output ||
    [input.candidate, input.producer].some(
      root => output === root || output.startsWith(root + path.sep)
    )
  )
    fail('canonical disjoint owned output');
  const owned = path.join(output, 'm4-p2-' + randomUUID());
  fs.mkdirSync(owned, { mode: 0o700 });
  const outputRoot = path.join(owned, 'output');
  fs.mkdirSync(outputRoot, { mode: 0o700 });
  const exporter = await import(
    pathToFileURL(path.join(input.producer, 'scripts/ci/p2/materialize-producer.mjs')).href
  );
  const exported = exporter.materializeRequiredP2Producer({
    gitDir: input.gitDir,
    context,
    targetRoot: path.join(owned, 'producer'),
  });
  assertM4P2ClosureNames(Object.keys(exported.files));
  const bootstrap = await import(
    pathToFileURL(path.join(exported.root, 'scripts/ci/p2/bootstrap.mjs')).href
  );
  const result = await bootstrap.runBootstrappedP2Coverage({
    candidateRoot: input.candidate,
    producerRoot: exported.root,
    outputRoot,
    gitDir: input.gitDir,
    context,
    ...ordinaryIdentity(),
  });
  const after = sourceCurrent(input, context);
  if (
    before.digest !== after.digest ||
    candidateBefore !== candidateCurrent(input, context, after.git, policy)
  )
    fail('source/candidate execution bookend');
  const handle = Object.freeze({ version: 1 });
  states.set(handle, {
    bootstrap,
    result,
    context: contextKey(context),
    sourceBefore: before.digest,
    candidateBefore,
    policy,
    policyDigest: hash(JSON.stringify(policy)),
    candidate: input.candidate,
    producer: input.producer,
    gitDir: input.gitDir,
  });
  return handle;
}

export function takeFixedM4P2ForJoin(handle, input) {
  const state = states.get(handle);
  if (
    !state ||
    state.context !== contextKey(input.context) ||
    state.candidate !== input.candidate ||
    state.producer !== input.producer ||
    state.gitDir !== input.gitDir
  )
    fail('fresh same-source/event private result required');
  const current = sourceCurrent(input, input.context);
  const policy = JSON.parse(
    fs.readFileSync(path.join(input.producer, 'scripts/ci/p2/policy.json'), 'utf8')
  );
  if (
    state.sourceBefore !== current.digest ||
    state.policyDigest !== hash(JSON.stringify(policy)) ||
    state.candidateBefore !== candidateCurrent(input, input.context, current.git, policy)
  )
    fail('final source/policy/candidate bookend');
  states.delete(handle); // A failed genuine one-use join also burns this adapter handle.
  const evidence = state.bootstrap.takeBootstrappedP2CoverageForJoin(state.result, input.context);
  return Object.freeze({
    ...evidence,
    candidateSnapshot: state.candidateBefore,
    producerClosure: state.sourceBefore,
    sourceContext: state.context,
    p2PolicySha256: state.policyDigest,
    providerPolicySha256: hash(JSON.stringify(PROVIDER_UNIT_POLICY)),
    affectedLineageQualified: false,
    ordinaryCoverageNativeCredit: false,
    productionCCredit: 0,
  });
}
