import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// U2-e: runs the collector with only the environment it needs. The staging release-gate step
// carries every release-gate account secret; none of them may reach the collector.

const ALLOWED = Object.freeze([
  'CI',
  'EXPECTED_COMMIT_SHA',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_ID',
  'HOME',
  'INTERDOMESTIK_VERCEL_IPV4_ONLY',
  'NODE_OPTIONS',
  'PATH',
  'RUNNER_TEMP',
  'RUNTIME_ATTESTATION_CANONICAL_HOST',
  'RUNTIME_ATTESTATION_HOSTNAME',
  'RUNTIME_ATTESTATION_MODE',
  'RUNTIME_ATTESTATION_OBSERVER_EMAIL',
  'RUNTIME_ATTESTATION_OBSERVER_PASSWORD',
  'RUNTIME_ATTESTATION_RECEIPT_PATH',
  'TMPDIR',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
]);

/** The collector's environment: the allowlisted names only, nothing else from the step. */
export function collectorEnv(env) {
  return Object.fromEntries(
    ALLOWED.filter(name => env[name] !== undefined).map(name => [name, env[name]])
  );
}

function main() {
  const collector = path.join(path.dirname(fileURLToPath(import.meta.url)), 'collect.mjs');
  const result = spawnSync(process.execPath, [collector], {
    env: collectorEnv(process.env),
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
