import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTRACT_DIR = 'scripts/ci';
const EXTRA_CONTRACT_FILES = Object.freeze(['scripts/check-modularity-guard.test.mjs']);
const NODE_TEST_ARGS = Object.freeze(['--test', '--test-concurrency=1']);

// Long-running guard-trust suites, excluded from core by exact name only. Every other contract
// test, including any file added later, lands in core by default.
export const GUARD_TRUST_SHARDS = Object.freeze({
  authority: Object.freeze(['scripts/ci/db-access-required-authority.test.mjs']),
  candidate: Object.freeze(['scripts/ci/db-access-required-candidate.test.mjs']),
  'merge-guard-git': Object.freeze([
    'scripts/ci/db-access-required-merge.test.mjs',
    'scripts/ci/db-access-guard.test.mjs',
    'scripts/ci/db-access-git.test.mjs',
  ]),
});

// Same file set as the shell glob in `test:ci:contracts`.
export function listContractTestFiles(root = REPO_ROOT) {
  const files = fs
    .readdirSync(path.join(root, CONTRACT_DIR), { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.') && entry.name.endsWith('.test.mjs'))
    .map(entry => `${CONTRACT_DIR}/${entry.name}`);
  return [...files, ...EXTRA_CONTRACT_FILES].sort();
}

export function contractTestPlan(root = REPO_ROOT) {
  const all = listContractTestFiles(root);
  const present = new Set(all);
  const guardTrust = Object.values(GUARD_TRUST_SHARDS).flat();
  const missing = guardTrust.filter(file => !present.has(file));
  if (missing.length > 0) {
    throw new Error(`guard-trust contract files missing: ${missing.join(', ')}`);
  }
  if (new Set(guardTrust).size !== guardTrust.length) {
    throw new Error('guard-trust contract shards overlap');
  }
  const excluded = new Set(guardTrust);
  return {
    all,
    shards: { core: all.filter(file => !excluded.has(file)), ...GUARD_TRUST_SHARDS },
  };
}

function runShard(root, name, files, { capture }) {
  const started = Date.now();
  // A shard is always its own top-level test runner, even when launched from inside one.
  const { NODE_TEST_CONTEXT: _nested, ...env } = process.env;
  const child = spawn(process.execPath, [...NODE_TEST_ARGS, ...files], {
    cwd: root,
    env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  const chunks = [];
  if (capture) {
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => chunks.push(chunk));
  }
  const result = new Promise(resolve => {
    child.on('error', error => {
      chunks.push(Buffer.from(`${error.stack ?? error.message}\n`));
      resolve({ name, files: files.length, code: null, signal: null, error: true });
    });
    child.on('close', (code, signal) =>
      resolve({ name, files: files.length, code, signal, seconds: (Date.now() - started) / 1000 })
    );
  });
  return { child, result: result.then(outcome => ({ ...outcome, output: Buffer.concat(chunks) })) };
}

const passed = outcome => outcome.code === 0 && outcome.signal === null && !outcome.error;

// Runs every shard concurrently without fail-fast. Each shard is still serialized internally and
// the run fails unless every shard exits 0.
export async function runParallel({
  root = REPO_ROOT,
  write = text => process.stdout.write(text),
} = {}) {
  const { shards } = contractTestPlan(root);
  const grouped = process.env.GITHUB_ACTIONS === 'true';
  const running = Object.entries(shards).map(([name, files]) =>
    runShard(root, name, files, { capture: true })
  );
  const stop = signal => {
    for (const { child } of running) child.kill(signal);
  };
  process.once('SIGINT', stop).once('SIGTERM', stop);
  const outcomes = await Promise.all(
    running.map(({ result }) =>
      result.then(outcome => {
        write(
          grouped ? `::group::contract shard ${outcome.name}\n` : `--- shard ${outcome.name}\n`
        );
        write(outcome.output.toString('utf8'));
        if (grouped) write('::endgroup::\n');
        return outcome;
      })
    )
  );
  process.off('SIGINT', stop).off('SIGTERM', stop);
  for (const outcome of outcomes) {
    const status = passed(outcome)
      ? 'pass'
      : `FAIL (code=${outcome.code} signal=${outcome.signal})`;
    write(
      `contract shard ${outcome.name}: ${status}; ${outcome.files} file(s); ${outcome.seconds ?? 0}s\n`
    );
  }
  return outcomes.every(passed) ? 0 : 1;
}

async function runSerial(root, files) {
  const { result } = runShard(root, 'serial', files, { capture: false });
  return passed(await result) ? 0 : 1;
}

export async function main(argv, root = REPO_ROOT) {
  const [mode, shard] = argv;
  const { shards } = contractTestPlan(root);
  if (mode === 'parallel') return runParallel({ root });
  if (mode === 'core') return runSerial(root, shards.core);
  if (mode === 'guard-trust' && shard === undefined) {
    return runSerial(root, Object.values(GUARD_TRUST_SHARDS).flat());
  }
  if (mode === 'guard-trust' && Object.hasOwn(GUARD_TRUST_SHARDS, shard)) {
    return runSerial(root, GUARD_TRUST_SHARDS[shard]);
  }
  if (mode === 'list' && Object.hasOwn(shards, shard)) {
    process.stdout.write(`${shards[shard].join('\n')}\n`);
    return 0;
  }
  console.error(
    'Usage: node scripts/ci/contract-test-shards.mjs <parallel|core|guard-trust [shard]|list <shard>>'
  );
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
