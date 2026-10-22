import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exact, hash, refuse } from './db-access-provider-runtime-identity.mjs';
import { CRM_CONTRACT_ID, validateCrmContract } from './db-access-crm-proof-shape.mjs';
import { materializeCrmRuntime } from './db-access-crm-runtime-materialize.mjs';
import { validateCrmRuntimeResult } from './db-access-crm-runtime-result.mjs';

const CHILD_FILES = [
  'driver',
  'fixture',
  'child',
  'cases-routing',
  'cases-reporting',
  'cases-auth',
  'cases-authority',
  'cases-session',
  'cases-backfill',
].map(name => 'db-access-crm-runtime-' + name + '.mjs');

// Mandatory direct execution by the new fixed producer. No candidate flag or prior receipt input.
export function runCrmRuntime({
  candidate,
  producer,
  assembly,
  tarballRoot,
  output,
  databaseUrl,
  policy,
  redact,
}) {
  const contract = policy.crmProof;
  if (!contract || contract.id !== CRM_CONTRACT_ID) refuse('mandatory CRM contract');
  validateCrmContract(contract);
  const materialized = materializeCrmRuntime({
    sourceRoot: candidate,
    producerRoot: producer,
    outputRoot: assembly,
    tarballRoot,
    policy,
  });
  const childSource = {};
  for (const name of CHILD_FILES) {
    const file = 'scripts/ci/' + name;
    const bytes = exact(producer, file, policy.producerFiles[file]);
    fs.writeFileSync(path.join(materialized.root, name), bytes);
    childSource[name] = hash(bytes);
  }
  const result = spawnSync(process.execPath, ['db-access-crm-runtime-driver.mjs'], {
    cwd: materialized.root,
    shell: false,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      PATH: '/usr/bin:/bin',
      HOME: path.join(assembly, 'home'),
      TMPDIR: assembly,
      TZ: 'UTC',
      LANG: 'C.UTF-8',
      DATABASE_URL: databaseUrl,
    },
  });
  const raw = redact(result.stdout) + redact(result.stderr);
  fs.writeFileSync(path.join(output, 'crm-runtime.log'), raw);
  if (result.error || result.signal || result.status !== 0)
    refuse('CRM runtime execution; raw log retained');
  for (const [file, digest] of Object.entries(childSource))
    if (hash(fs.readFileSync(path.join(materialized.root, file))) !== digest)
      refuse('CRM child source drift');
  const bundle = fs.readFileSync(path.join(materialized.root, 'crm-runtime.cjs'));
  if (hash(bundle) !== materialized.bundleSha256) refuse('CRM compiled source drift');
  const report = JSON.parse(fs.readFileSync(path.join(materialized.root, 'crm-completion.json')));
  const completion = validateCrmRuntimeResult(report, contract);
  fs.writeFileSync(path.join(output, 'crm-completion.json'), JSON.stringify(report));
  return {
    ...completion,
    runtimeLogSha256: hash(raw),
    reportSha256: hash(JSON.stringify(report)),
    childSource,
    copied: materialized.copied,
    packages: materialized.packages,
    patches: materialized.patches,
    dependencyGraphSha256: materialized.dependencyGraphSha256,
    lockSha256: materialized.lockSha256,
    entrySha256: materialized.entrySha256,
    compilerVersion: materialized.compilerVersion,
    bundleSha256: materialized.bundleSha256,
    metafileSha256: materialized.metafileSha256,
  };
}
