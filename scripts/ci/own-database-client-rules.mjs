// CHK-13 (R-13), part (b): the predicates and the per-kind promises that
// own-database-client.test.mjs applies to the reviewed inventory. This module is the checker
// itself; it is excluded from the search by its exact path and loads no driver (tested).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerWorkflowProblems } from './own-database-client-workflow.mjs';

export { ownerWorkflowProblems };

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RULES_MODULE = 'scripts/ci/own-database-client-rules.mjs';

// Script roots, package script folders, package roots, the repository root, and the
// database-building test lane (pg16), which is in scope although its files are tests.
const EXTENSIONS = '(?:[cm]?[jt]s|sh|bash|zsh|py)';
export const SCOPE = new RegExp(
  String.raw`^(?:(?:scripts|tools|ops|apps\/web\/scripts)\/.+|packages\/[^/]+\/(?:test\/pg16|src\/scripts)\/.+|packages\/[^/]+\/[^/]+|[^/]+)\.${EXTENSIONS}$`,
  'u'
);
const PG16 = /^packages\/[^/]+\/test\/pg16\//u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]s$|\.d\.[cm]?ts$/u;

const DRIVER = String.raw`(?:postgres|pg|pg-pool|drizzle-orm\/(?:postgres-js|node-postgres|pg-proxy|pglite|neon-http|neon-serverless|vercel-postgres|xata-http|aws-data-api\/pg))(?:\/[^'"\x60\s]*)?`;
const PYTHON_DRIVER = /^[ \t]*(?:import|from)[ \t]+(?:psycopg2?|asyncpg|pg8000|sqlalchemy)\b/mu;
const COMMAND = /\b(?:psql|pg_dump|pg_dumpall|pg_restore|pgcli|createdb|dropdb)\b/gu;
const NAMES_CLIENT = [
  new RegExp(String.raw`['"\x60]${DRIVER}['"\x60]`, 'u'),
  PYTHON_DRIVER,
  /\b(?:psql|pg_dump|pg_dumpall|pg_restore|pgcli|createdb|dropdb)\b/u,
  /\bDATABASE_URL\b(?!_)/u,
];
// Loading a driver: import, side-effect import, export-from, dynamic import, require.
const LOADS_DRIVER = new RegExp(
  [
    String.raw`\b(?:from|import)\s*['"\x60]${DRIVER}['"\x60]`,
    String.raw`\b(?:import|require)\s*\(\s*['"\x60]${DRIVER}['"\x60]\s*\)`,
  ].join('|'),
  'u'
);
// A write or schema statement.
const WRITES = [
  /\b(?:insert\s+into|delete\s+from|truncate|grant|revoke)\b/iu,
  /\bdrop\s+(?:table|type|index|schema|policy|database|role|function|trigger|view)\b/iu,
  /\balter\s+(?:table|role|type|database|policy|default|system)\b/iu,
  /\bcreate\s+(?:table|index|policy|role|database|function|trigger|extension|schema|view)\b/iu,
  /\bcopy\s+\S+\s+from\b/iu,
  /\bupdate\s+"?[a-z_.]+"?\s+set\b/iu,
];
export const WRITE = Object.freeze({ test: source => WRITES.some(write => write.test(source)) });

// The one owner operation, pinned here so that the JSON cannot add another.
export const OWNER_OPERATIONS = Object.freeze([
  Object.freeze({
    path: 'scripts/ci/runtime-attestation/enrol-staging.mjs',
    operation: 'ida.u2e.staging-enrol.v1',
    workflow: '.github/workflows/staging-runtime-attestation-enrol.yml',
    job: 'enrol',
    modules: Object.freeze(['scripts/ci/runtime-attestation/enrol-core.mjs']),
  }),
]);
// Only these modules stand under another entry instead of their own: the owner operation's.
export const PINNED_MODULES = new Set(OWNER_OPERATIONS.flatMap(operation => operation.modules));

export const namesClient = source => NAMES_CLIENT.some(pattern => pattern.test(source));
export const loadsDriver = source => LOADS_DRIVER.test(source) || PYTHON_DRIVER.test(source);
const commands = source => [...source.matchAll(COMMAND)];

export function scriptFiles() {
  const listed = spawnSync(
    '/usr/bin/git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(listed.status, 0, listed.stderr);
  return listed.stdout
    .split('\0')
    .filter(
      file =>
        file !== RULES_MODULE &&
        SCOPE.test(file) &&
        (PG16.test(file) || !TEST_FILE.test(file)) &&
        existsSync(join(root, file))
    );
}

function checkNoClient(entry, source) {
  assert.equal(loadsDriver(source), false, `${entry.path}: loads no driver`);
  assert.deepEqual(commands(source), [], `${entry.path}: runs no client command`);
  assert.equal(WRITE.test(source), false, `${entry.path}: holds no write statement`);
}

function checkReadOnly(entry, source) {
  assert.match(source, /\brunReadOnlyReport\b/u, `${entry.path}: report through the runner`);
  assert.doesNotMatch(source, /\.unsafe\s*\(/u, `${entry.path}: no statement outside it`);
  assert.deepEqual(commands(source), [], entry.path);
  assert.equal(WRITE.test(source), false, entry.path);
}

// The reviewed probe bodies, pinned byte for byte (sha256 of the heredoc's text): open one client
// on the given URL, run `select 1`, close it. Any other body, also one that only appears to query,
// is refused until this table is reviewed.
export const PINNED_PROBE_BODIES = new Set([
  '32e877f3131046ec5898821b6d44b3cb7197a3e067bc052ae1415dfb6bcb24b8',
]);
// The shell construct around each probe, in order: its keyword, and the sha256 of the whole
// construct from the keyword line to its closing fi or done. M4 checks once with `if`, then waits
// with the `until` retry loop; a rewrite of either (an `if` for the loop, a loop that no longer
// retries) is a change to review.
export const PINNED_PROBE_CONSTRUCTS = Object.freeze({
  'scripts/m4-gatekeeper.sh': Object.freeze([
    Object.freeze(['if', '2a113bda6b2d83e304b92531050dcc016e37995149a9443876ea5eee63a78252']),
    Object.freeze(['until', '6020aeb56751244ccafee23d9c4eda779a240fc6e9aba3f6047aabd09ff63cf6']),
  ]),
});
const sha256 = text => createHash('sha256').update(text).digest('hex');
const CLOSER = Object.freeze({ if: ['then', 'fi'], until: ['do', 'done'] });

// Each `if|until node - <<'NODE'` construct, read line by line: the heredoc body, then the
// keyword's own `then`/`do` at the same indent, then the first `fi`/`done` at that indent.
export function probeConstructs(source) {
  const lines = source.split('\n');
  const found = [];
  for (let at = 0; at < lines.length; at += 1) {
    const head = /^([ \t]*)(if|until|while) node - <<'NODE'$/u.exec(lines[at]);
    if (!head) continue;
    const [, indent, keyword] = head;
    const [open, close] = CLOSER[keyword] ?? [];
    const bodyEnd = lines.indexOf('NODE', at + 1);
    const last = bodyEnd < 0 ? -1 : lines.indexOf(`${indent}${close}`, bodyEnd + 1);
    const opened = bodyEnd >= 0 && lines[bodyEnd + 1] === `${indent}${open}`;
    found.push({
      keyword,
      body: bodyEnd < 0 ? '' : lines.slice(at + 1, bodyEnd).join('\n'),
      text: opened && last > bodyEnd ? lines.slice(at, last + 1).join('\n') : '',
    });
  }
  return found;
}

// Each embedded script (a shell heredoc) that loads a driver is a pinned probe body run as the
// condition of its pinned construct; nothing outside those scripts loads a driver or runs a client
// command.
export function checkProbe(entry, source) {
  const pinned = PINNED_PROBE_CONSTRUCTS[entry.path];
  assert.ok(pinned, `${entry.path}: not a pinned probe`);
  const heredocs = [...source.matchAll(/<<-?'?(\w+)'?\n([\s\S]*?)\n[ \t]*\1$/gmu)];
  const drivers = heredocs.map(match => match[2]).filter(loadsDriver);
  const constructs = probeConstructs(source);
  assert.equal(drivers.length, pinned.length, `${entry.path}: probes`);
  assert.deepEqual(
    constructs.map(construct => construct.body),
    drivers,
    `${entry.path}: each probe is a condition`
  );
  let outside = source;
  for (const match of heredocs) outside = outside.replace(match[0], '');
  assert.equal(loadsDriver(outside), false, `${entry.path}: no driver outside the probes`);
  assert.deepEqual(commands(source), [], `${entry.path}: runs no client command`);
  for (const script of drivers) {
    assert.ok(PINNED_PROBE_BODIES.has(sha256(script)), `${entry.path}: a reviewed probe body`);
  }
  assert.deepEqual(
    constructs.map(construct => [construct.keyword, sha256(construct.text)]),
    pinned.map(([keyword, digest]) => [keyword, digest]),
    `${entry.path}: each probe stands in its reviewed if or until construct`
  );
}

// Inside a local container through docker exec, for status only: no driver, no database URL and
// no client command (pg_isready is not one).
export function checkContainerLocal(entry, source) {
  checkNoClient(entry, source);
  assert.doesNotMatch(source, /\bDATABASE_URL\b(?!_)/u, `${entry.path}: reads no URL`);
}

// Probes pinned byte for byte, so any change needs a new review of this table. The verification
// machine's Docker probe: one fixed catalogue read in a local container, over a local socket.
export const PINNED_READ_PROBES = Object.freeze({
  'scripts/ci/verify-machine-docker.mjs':
    '1b1adf7337d711e8b16a6fa154163cee4eb99fca9ffedd0d0172c58c4aa7dbbe',
});

export function checkPinnedReadProbe(entry, source) {
  assert.ok(Object.hasOwn(PINNED_READ_PROBES, entry.path), `${entry.path}: not a pinned probe`);
  assert.equal(
    sha256(source),
    PINNED_READ_PROBES[entry.path],
    `${entry.path}: changed since its review`
  );
}

function checkOwnerOperation(entry) {
  const pinned = OWNER_OPERATIONS.find(operation => operation.path === entry.path);
  assert.ok(pinned, `${entry.path}: not a pinned owner operation`);
  assert.deepEqual(
    { operation: entry.operation, workflow: entry.workflow, modules: entry.modules },
    { operation: pinned.operation, workflow: pinned.workflow, modules: [...pinned.modules] }
  );
  const workflow = readFileSync(join(root, entry.workflow), 'utf8');
  assert.deepEqual(ownerWorkflowProblems(workflow, pinned), [], entry.workflow);
  for (const module of entry.modules) {
    assert.equal(loadsDriver(readFileSync(join(root, module), 'utf8')), false, module);
  }
}

function checkResidual(entry, source) {
  // A disposable-database writer that has not moved yet: it names its follow-up and refuses every
  // non-disposable target before it connects.
  assert.ok(entry.followUp?.length >= 40, `${entry.path}: follow-up`);
  assert.match(
    source,
    /assertDisposableTarget\(process\.env\)|must target a loopback host/u,
    `${entry.path}: refuses non-disposable targets`
  );
}

// Each kind's promise, checked against the file itself; an unknown kind is refused.
function checkKind(entry, source) {
  switch (entry.kind) {
    case 'launcher':
    case 'contract':
      return checkNoClient(entry, source);
    case 'read-only':
      return checkReadOnly(entry, source);
    case 'probe':
      return checkProbe(entry, source);
    case 'container-local':
      return checkContainerLocal(entry, source);
    case 'pinned-read-probe':
      return checkPinnedReadProbe(entry, source);
    case 'owner-operation':
      return checkOwnerOperation(entry);
    case 'residual':
      return checkResidual(entry, source);
    default:
      return assert.fail(`${entry.path}: kind ${entry.kind}`);
  }
}

/** Applies the entry's kind to `source`; throws an assertion error when a promise is broken. */
export function checkEntry(entry, source) {
  assert.ok(entry.reason?.length >= 40, `${entry.path}: reason`);
  if (entry.kind !== 'owner-operation') {
    assert.equal(entry.modules, undefined, `${entry.path}: only the owner operation has modules`);
  }
  checkKind(entry, source);
}
