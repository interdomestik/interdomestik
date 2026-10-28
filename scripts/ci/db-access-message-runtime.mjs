import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hash, refuse } from './db-access-provider-runtime-identity.mjs';
import { materializeMessageRuntime } from './db-access-message-runtime-materialize.mjs';
import {
  MESSAGE_PROOF_CONTRACT,
  MESSAGE_RUNS,
  assertMessageContract,
  messageCaseIdentities,
} from './db-access-message-proof-registry.mjs';
import {
  messageRunResultFile,
  validateMessageRuntimeResults,
} from './db-access-message-runtime-result.mjs';

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
  assertMessageContract(contract, reason => refuse('message proof contract ' + reason));
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
  // Re-validate every fresh per-file report here; the driver completion is never trusted alone.
  const reports = MESSAGE_RUNS.map((_, index) =>
    JSON.parse(fs.readFileSync(path.join(materialized.root, messageRunResultFile(index))))
  );
  const files = validateMessageRuntimeResults(reports);
  const completion = JSON.parse(
    fs.readFileSync(path.join(materialized.root, 'message-completion.json'))
  );
  if (
    completion.version !== MESSAGE_PROOF_CONTRACT.version ||
    completion.contractId !== MESSAGE_PROOF_CONTRACT.id ||
    completion.setupComplete !== true ||
    completion.teardownComplete !== true ||
    completion.passedTests !== MESSAGE_PROOF_CONTRACT.requiredTests ||
    JSON.stringify(completion.files) !== JSON.stringify(files) ||
    JSON.stringify(completion.identities) !== JSON.stringify(messageCaseIdentities())
  )
    refuse('message setup/teardown completion');
  reports.forEach((report, index) =>
    fs.writeFileSync(path.join(output, messageRunResultFile(index)), redact(JSON.stringify(report)))
  );
  fs.writeFileSync(path.join(output, 'message-completion.json'), JSON.stringify(completion));
  return {
    ...completion,
    runtimeLogSha256: hash(raw),
    reportSha256: hash(JSON.stringify(reports)),
    reportSha256s: reports.map(report => hash(JSON.stringify(report))),
    lockSha256: materialized.lockSha256,
    packages: materialized.packages,
    copied: materialized.copied,
  };
}
