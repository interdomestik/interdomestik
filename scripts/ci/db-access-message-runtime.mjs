import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hash, refuse } from './db-access-provider-runtime-identity.mjs';
import { materializeMessageRuntime } from './db-access-message-runtime-materialize.mjs';
import { validateMessageTestResult } from './db-access-message-runtime-result.mjs';

export function runMessageRuntime({
  candidate,
  producer,
  assembly,
  tarballRoot,
  output,
  databaseUrl,
  policy,
  redact,
}) {
  const contract = policy.messageProof;
  if (!contract) return undefined;
  if (
    contract.id !== 's8-message-integration-proof-v1' ||
    contract.requiredTests !== 9 ||
    contract.runtimeRequired !== true ||
    contract.acceptedReceiptInputs !== false
  )
    refuse('message proof contract');
  const materialized = materializeMessageRuntime({
    sourceRoot: candidate,
    producerRoot: producer,
    outputRoot: assembly,
    tarballRoot,
    policy,
  });
  const result = spawnSync(process.execPath, ['db-access-message-runtime-driver.mjs'], {
    cwd: materialized.root,
    shell: false,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      PATH: '/usr/bin:/bin',
      HOME: path.join(assembly, 'home'),
      TMPDIR: assembly,
      TZ: 'UTC',
      LANG: 'C.UTF-8',
      CI: '1',
      DATABASE_URL: databaseUrl,
      DATABASE_URL_RLS: databaseUrl,
    },
  });
  const raw = redact(result.stdout) + redact(result.stderr);
  fs.writeFileSync(path.join(output, 'messages-runtime.log'), raw);
  if (result.error || result.signal || result.status !== 0)
    refuse('message runtime execution (raw log retained)');
  const report = JSON.parse(fs.readFileSync(path.join(materialized.root, 'messages-result.json')));
  const identities = validateMessageTestResult(report);
  const completion = JSON.parse(
    fs.readFileSync(path.join(materialized.root, 'message-completion.json'))
  );
  if (
    completion.setupComplete !== true ||
    completion.teardownComplete !== true ||
    completion.passedTests !== 9 ||
    JSON.stringify(completion.identities) !== JSON.stringify(identities)
  )
    refuse('message setup/teardown completion');
  fs.writeFileSync(path.join(output, 'messages-result.json'), redact(JSON.stringify(report)));
  fs.writeFileSync(path.join(output, 'message-completion.json'), JSON.stringify(completion));
  return {
    ...completion,
    runtimeLogSha256: hash(raw),
    reportSha256: hash(JSON.stringify(report)),
    lockSha256: materialized.lockSha256,
    packages: materialized.packages,
    copied: materialized.copied,
  };
}
