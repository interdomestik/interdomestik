import { providerRuntimeProducerRecords } from './db-access-provider-runtime-producer-records.mjs';
import {
  crmCandidateRecords,
  executeCrmProof,
  attachCrmJoin,
} from './db-access-crm-runtime-required.mjs';
import { runMessageRuntime } from './db-access-message-runtime.mjs';
import {
  hash,
  refuse,
  safeEnv,
  authenticateRuntimeContext,
  exact,
  snapshot,
} from './db-access-provider-runtime-identity.mjs';
export { authenticateRuntimeContext } from './db-access-provider-runtime-identity.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROVIDER_UNIT_POLICY as policy } from './db-access-provider-unit-policy.mjs';
import { ADOPTION } from './db-access-adoption.mjs';
import { materializeProviderRuntime } from './db-access-provider-runtime-materialize.mjs';
import { bindM4CandidateRecords } from './db-access-m4-runtime-records.mjs';
// Context is created by the fixed workflow from its authenticated event and fresh bare Git.
// This command never accepts a prior runtime result, candidate policy, or candidate test runner.

export async function runRequiredProviderRuntime({
  repoRoot,
  tarballRoot,
  outputRoot,
  gitDir,
  context,
  databaseUrl,
}) {
  const candidate = fs.realpathSync(repoRoot);
  const producer = fs.realpathSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  );
  const output = fs.realpathSync(outputRoot);
  if (
    output !== path.resolve(outputRoot) ||
    output === candidate ||
    output.startsWith(candidate + path.sep) ||
    output === producer ||
    output.startsWith(producer + path.sep) ||
    fs.readdirSync(output).length
  )
    refuse('output isolation');
  const git = authenticateRuntimeContext(gitDir, context);
  git.readBlob = oid =>
    execFileSync(
      '/usr/bin/git',
      ['--no-replace-objects', '--git-dir', gitDir, 'cat-file', 'blob', oid],
      { env: safeEnv, maxBuffer: 32 * 1024 * 1024, timeout: 30_000 }
    );
  if (
    policy.adoptionCommit !== ADOPTION.commit ||
    policy.adoptionTree !== ADOPTION.tree ||
    policy.baselineSha256 !== ADOPTION.files['scripts/ci/db-access-baseline.json'] ||
    policy.runtimeEnforcement.mode !== 'required-direct-execution' ||
    policy.runtimeEnforcement.acceptedReceiptInputs !== false
  )
    refuse('fixed contract identity');
  const address = new URL(databaseUrl);
  if (
    address.protocol !== 'postgresql:' ||
    address.hostname !== '127.0.0.1' ||
    !['5432', '55438'].includes(address.port) ||
    address.pathname !== '/interdomestik_test' ||
    address.username !== 'postgres' ||
    !address.password ||
    address.search ||
    address.hash
  )
    refuse('owned database target');
  const baseline = {
    'scripts/ci/db-access-baseline.json': {
      sha256: policy.baselineSha256,
      bytes: policy.baselineBytes,
      mode: '100644',
    },
  };
  const candidateRecords = {
    ...policy.files,
    ...policy.resolverFiles,
    ...policy.testHarness,
    ...policy.namedProof?.files,
    ...policy.messageProof?.files,
    ...policy.messageProof?.configuration,
    ...policy.messageProof?.migrations,
    ...crmCandidateRecords(policy, producer),
    ...(policy.namedProof ? { 'apps/web/tsconfig.json': policy.namedProof.configuration } : {}),
    ...baseline,
  };
  bindM4CandidateRecords(candidateRecords, policy);
  const producerRecords = providerRuntimeProducerRecords(policy, producer);
  const before = {
    candidate: snapshot(candidate, context.candidateCommit, candidateRecords, git),
    producer: snapshot(producer, context.sourceCommit, producerRecords, git),
  };
  const assembly = path.join(output, 'assembly');
  fs.mkdirSync(assembly);
  const materialized = await materializeProviderRuntime({
    sourceRoot: candidate,
    outputRoot: assembly,
    tarballRoot,
    policy,
    runtimeSourceRoot: producer,
  });
  for (const name of [
    'db-access-provider-runtime-probe.mjs',
    'db-access-provider-runtime-fixture.mjs',
    ...(policy.namedProof
      ? [
          'db-access-named-proof-loader.mjs',
          'db-access-named-proof-probe.mjs',
          'db-access-named-proof-live.mjs',
        ]
      : []),
  ]) {
    const bytes = exact(producer, 'scripts/ci/' + name, policy.producerFiles['scripts/ci/' + name]);
    const target =
      name === 'db-access-provider-runtime-probe.mjs' ? 'provider-runtime-probe.mjs' : name;
    fs.writeFileSync(path.join(materialized.runtime, target), bytes);
  }
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      '--test-concurrency=1',
      'packages/database/test/rls-role-posture-query.test.js',
      'provider-runtime-probe.mjs',
    ],
    {
      cwd: materialized.runtime,
      shell: false,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: path.join(assembly, 'home'),
        TMPDIR: assembly,
        TZ: 'UTC',
        LANG: 'C.UTF-8',
        CI: '1',
        DATABASE_URL: databaseUrl,
        REQUIRE_RLS_INTEGRATION: '1',
      },
    }
  );
  const secrets = [databaseUrl, address.password, decodeURIComponent(address.password)].filter(
    Boolean
  );
  const redact = text =>
    secrets.reduce((value, secret) => value.split(secret).join('[REDACTED]'), text ?? '');
  const raw = redact(result.stdout) + redact(result.stderr);
  fs.writeFileSync(path.join(output, 'runtime.tap'), raw);
  if (result.error || result.signal || result.status !== 0)
    refuse('runtime execution (raw log retained)');
  for (const [name, count] of Object.entries({
    tests: policy.runtimeEnforcement.requiredTests,
    pass: policy.runtimeEnforcement.requiredTests,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  })) {
    const matches = [...raw.matchAll(new RegExp('^# ' + name + ' (\\d+)\\s*$', 'gm'))];
    if (matches.length !== 1 || Number(matches[0][1]) !== count) refuse('runtime TAP ' + name);
  }
  let namedPassedTests = 0;
  let namedRuntimeLogSha256;
  if (policy.namedProof) {
    if (
      policy.namedProof.id !== 's8-named-operations-v1' ||
      policy.namedProof.requiredTests !== 17 ||
      policy.namedProof.runtimeRequired !== true ||
      policy.namedProof.acceptedReceiptInputs !== false
    )
      refuse('named proof contract');
    const named = spawnSync(
      process.execPath,
      [
        '--experimental-vm-modules',
        '--test',
        '--test-reporter=tap',
        '--test-concurrency=1',
        'db-access-named-proof-probe.mjs',
        'packages/database/test/owned-tenant-transaction.test.js',
        'packages/database/test/rls-bootstrap.test.js',
      ],
      {
        cwd: materialized.runtime,
        shell: false,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          PATH: '/usr/bin:/bin',
          HOME: path.join(assembly, 'home'),
          TMPDIR: assembly,
          TZ: 'UTC',
          LANG: 'C.UTF-8',
          CI: '1',
          DATABASE_URL: databaseUrl,
        },
      }
    );
    const namedRaw = redact(named.stdout) + redact(named.stderr);
    fs.writeFileSync(path.join(output, 'named-runtime.tap'), namedRaw);
    if (named.error || named.signal || named.status !== 0)
      refuse('named runtime execution (raw log retained)');
    for (const [name, count] of Object.entries({
      tests: 17,
      pass: 17,
      fail: 0,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    })) {
      const matches = [...namedRaw.matchAll(new RegExp('^# ' + name + ' (\\d+)\\s*$', 'gm'))];
      if (matches.length !== 1 || Number(matches[0][1]) !== count)
        refuse('named runtime TAP ' + name);
    }
    namedPassedTests = 17;
    namedRuntimeLogSha256 = hash(namedRaw);
  }
  const runtimeInput = {
    candidate,
    producer,
    assembly,
    tarballRoot,
    output,
    databaseUrl,
    policy,
    redact,
    context,
  };
  const messageRuntime = runMessageRuntime(runtimeInput);
  const crm = executeCrmProof(runtimeInput);
  // Bookends cover the entire provider/message/CRM/static interval.
  authenticateRuntimeContext(gitDir, context);
  const after = {
    candidate: snapshot(candidate, context.candidateCommit, candidateRecords, git),
    producer: snapshot(producer, context.sourceCommit, producerRecords, git),
  };
  if (JSON.stringify(before) !== JSON.stringify(after)) refuse('runtime input changed');
  const receipt = {
    version: 1,
    messageRuntime,
    context,
    policySha256: hash(JSON.stringify(policy)),
    adoption: ADOPTION.commit,
    before,
    after,
    materialized,
    runtimeLogSha256: hash(raw),
    namedPassedTests,
    namedRuntimeLogSha256,
    passedTests: policy.runtimeEnforcement.requiredTests,
    runtimeExecuted: true,
    staticResidualStillRequired: true,
    wholeS8Acceptance: false,
  };
  attachCrmJoin({ crm, context, policy, receipt, output });
  fs.writeFileSync(
    path.join(output, 'runtime-result.json'),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repoRoot, tarballRoot, outputRoot, gitDir, contextFile, ...extra] = process.argv.slice(2);
  if (!contextFile || extra.length) refuse('expected five fixed-workflow arguments');
  await runRequiredProviderRuntime({
    repoRoot,
    tarballRoot,
    outputRoot,
    gitDir,
    context: JSON.parse(fs.readFileSync(contextFile, 'utf8')),
    databaseUrl: process.env.DATABASE_URL,
  });
  console.log('Fixed provider runtime executed successfully; residual guard remains required.');
}
