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
  's2-workflow': Object.freeze([
    'scripts/ci/tenant-guard-s2-workflow.isolation.test.mjs',
    'scripts/ci/tenant-guard-s2-workflow.test.mjs',
  ]),
});

// Legacy DB-access guard assertions retired by the owner-authorized switch to the S″ tenant guard
// (2026-11-02), by exact file or exact test name. Their bytes stay unchanged (db-access-adoption
// hashes them; baseline604 and ADOPTION are never edited) and they still run at a historical
// checkout. They exercise the removed ci.yml protected_db_access step, or the legacy 604-entry and
// kernel-immutability policy. Successor coverage: tenant-guard*.test.mjs and
// tenant-guard-s2-workflow*.test.mjs.
export const RETIRED_LEGACY_FILES = Object.freeze([
  'scripts/ci/db-access-protected-bootstrap.test.mjs',
  'scripts/ci/db-access-protected-route.test.mjs',
  'scripts/ci/db-access-resolver-transition-ci.test.mjs',
]);
export const RETIRED_LEGACY_TESTS = Object.freeze({
  'scripts/ci/db-access-guard.test.mjs': Object.freeze([
    'actual production CLI authenticates root epoch and preserves 604 original entries',
    'existing guard remains selected by mandatory lanes and baseline bytes stay historical',
  ]),
  'scripts/ci/db-access-git.test.mjs': Object.freeze([
    'candidate-local hostile PATH never executes during real fixtures, trust or production CLI',
  ]),
});

const byCodeUnit = (a, b) => (a < b ? -1 : Number(a > b));
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
const testDeclarations = (source, name) =>
  source.match(new RegExp(`\\btest\\(\\s*(['"\`])${escapeRegExp(name)}\\1`, 'gu'))?.length ?? 0;

// The contract glob: every scripts/ci/*.test.mjs plus the extra files, before retirement.
export function listContractTestFiles(root = REPO_ROOT) {
  const files = fs
    .readdirSync(path.join(root, CONTRACT_DIR), { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.') && entry.name.endsWith('.test.mjs'))
    .map(entry => `${CONTRACT_DIR}/${entry.name}`);
  return [...files, ...EXTRA_CONTRACT_FILES].sort((a, b) => a.localeCompare(b));
}

// A retired file or test that is missing, renamed or ambiguous fails closed: retirement never
// silently widens to anything but the named legacy assertions.
function retirement(root, all) {
  const present = new Set(all);
  const files = [...RETIRED_LEGACY_FILES, ...Object.keys(RETIRED_LEGACY_TESTS)];
  const missing = files.filter(file => !present.has(file));
  if (missing.length > 0) throw new Error(`retired legacy files missing: ${missing.join(', ')}`);
  const sources = new Map(all.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  const skipArgs = [];
  for (const [file, names] of Object.entries(RETIRED_LEGACY_TESTS)) {
    for (const name of names) {
      const declared = [...sources].filter(([, source]) => testDeclarations(source, name) > 0);
      if (
        declared.length !== 1 ||
        declared[0][0] !== file ||
        testDeclarations(sources.get(file), name) !== 1
      ) {
        throw new Error(`retired legacy test is not declared exactly once in ${file}: ${name}`);
      }
      skipArgs.push(`--test-skip-pattern=^${escapeRegExp(name)}$`);
    }
  }
  return { files: new Set(RETIRED_LEGACY_FILES), skipArgs };
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
  const retired = retirement(root, all);
  if (guardTrust.some(file => retired.files.has(file))) {
    throw new Error('a guard-trust shard names a retired legacy file');
  }
  const excluded = new Set([...guardTrust, ...retired.files]);
  return {
    all,
    retired: [...retired.files],
    skipArgs: retired.skipArgs,
    shards: { core: all.filter(file => !excluded.has(file)), ...GUARD_TRUST_SHARDS },
  };
}

function runShard(root, name, files, { capture, skipArgs = [] }) {
  const started = Date.now();
  // A shard is always its own top-level test runner, even when launched from inside one.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [...NODE_TEST_ARGS, ...skipArgs, ...files], {
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
  const { shards, skipArgs } = contractTestPlan(root);
  const grouped = process.env.GITHUB_ACTIONS === 'true';
  const running = Object.entries(shards).map(([name, files]) =>
    runShard(root, name, files, { capture: true, skipArgs })
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

async function runSerial(root, files, skipArgs, capture) {
  const { result } = runShard(root, 'serial', files, { capture, skipArgs });
  return passed(await result) ? 0 : 1;
}

// `capture` keeps a nested runner's output out of the caller's stream (used by the contract tests).
export async function main(argv, root = REPO_ROOT, { capture = false } = {}) {
  const [mode, shard] = argv;
  const { shards, skipArgs } = contractTestPlan(root);
  const serial = files => runSerial(root, files, skipArgs, capture);
  if (mode === 'parallel') return runParallel({ root });
  // Every active contract file in one serialized runner: the full local and Z620 parity lane.
  if (mode === 'all') return serial(Object.values(shards).flat().sort(byCodeUnit));
  if (mode === 'core') return serial(shards.core);
  if (mode === 'guard-trust' && shard === undefined) {
    return serial(Object.values(GUARD_TRUST_SHARDS).flat());
  }
  if (mode === 'guard-trust' && Object.hasOwn(GUARD_TRUST_SHARDS, shard)) {
    return serial(GUARD_TRUST_SHARDS[shard]);
  }
  if (mode === 'list' && Object.hasOwn(shards, shard)) {
    process.stdout.write(`${shards[shard].join('\n')}\n`);
    return 0;
  }
  console.error(
    'Usage: node scripts/ci/contract-test-shards.mjs <all|parallel|core|guard-trust [shard]|list <shard>>'
  );
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
