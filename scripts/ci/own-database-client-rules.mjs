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

// Every template literal of a script with the identifier that tags it ('' when untagged).
function taggedTemplates(script) {
  return [...script.matchAll(/`([^`]*)`/gu)].map(match => {
    let end = match.index;
    while (end > 0 && /\s/u.test(script[end - 1])) end -= 1;
    let start = end;
    while (start > 0 && /\w/u.test(script[start - 1])) start -= 1;
    return [script.slice(start, end), match[1]];
  });
}

// Each embedded script (a shell heredoc) that loads a driver opens one client and runs on it
// only the literal `select 1`; nothing outside those scripts loads a driver or runs a command.
export function checkProbe(entry, source) {
  const heredocs = [...source.matchAll(/<<-?'?(\w+)'?\n([\s\S]*?)\n[ \t]*\1$/gmu)];
  const drivers = heredocs.map(match => match[2]).filter(loadsDriver);
  assert.ok(drivers.length > 0, `${entry.path}: probes`);
  let outside = source;
  for (const match of heredocs) outside = outside.replace(match[0], '');
  assert.equal(loadsDriver(outside), false, `${entry.path}: no driver outside the probes`);
  assert.deepEqual(commands(source), [], `${entry.path}: runs no client command`);
  for (const script of drivers) {
    // No comment, so that every query the checks below see is one the probe runs.
    assert.doesNotMatch(script, /\/[/*]/u, `${entry.path}: no comment in a probe`);
    const clients = [...script.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*postgres\s*\(/gu)];
    assert.equal(clients.length, 1, `${entry.path}: one client per probe`);
    assert.equal([...script.matchAll(/\bpostgres\s*\(/gu)].length, 1, entry.path);
    const client = clients[0][1];
    const queries = taggedTemplates(script);
    assert.ok(queries.length > 0, `${entry.path}: the probe queries`);
    assert.deepEqual(new Set(queries.map(String)), new Set([`${client},select 1`]), entry.path);
    assert.doesNotMatch(script, /\.(?:unsafe|query|file|begin)\s*\(/u, entry.path);
    assert.doesNotMatch(script, new RegExp(String.raw`\b${client}\s*\(`, 'u'), entry.path);
  }
}

// The options a container-local psql may carry before its one command, each with its value: a
// quoted literal, or (for -d) a bare identifier. Anything else in the argument list is refused.
const PSQL_OPTIONS = Object.freeze({
  "'-U'": /^'postgres'$/u,
  "'-d'": /^(?:[A-Za-z_]\w*|'[a-z_][a-z0-9_]*')$/u,
  "'-v'": /^'ON_ERROR_STOP=1'$/u,
});

// The argument list after psql, element by element: each must be a single-quoted literal without
// a comma or quote, or a bare identifier, so that no element hides another.
function psqlArguments(entry, source, index) {
  const end = source.indexOf(']', index);
  assert.ok(end > index, `${entry.path}: psql arguments end`);
  const elements = source
    .slice(index, end)
    .split(',')
    .map(element => element.trim());
  if (elements.at(-1) === '') elements.pop();
  for (const element of elements) {
    assert.match(element, /^(?:'[^',\\]*'|[A-Za-z_]\w*)$/u, `${entry.path}: plain ${element}`);
  }
  return elements;
}

// Inside a local container through docker exec, and only a read-only probe: psql with the options
// above and, last and once, -c 'select 1'.
export function checkContainerLocal(entry, source) {
  assert.equal(loadsDriver(source), false, `${entry.path}: loads no driver`);
  assert.doesNotMatch(source, /\bDATABASE_URL\b(?!_)/u, `${entry.path}: reads no URL`);
  for (const match of commands(source)) {
    const before = source.slice(Math.max(0, match.index - 200), match.index);
    assert.match(
      before,
      /Z620_EXECUTABLES\.docker,\s*\[\s*'exec',\s*[\w'"]+,\s*'$/u,
      `${entry.path}: ${match[0]} runs only inside a local container through docker exec`
    );
    assert.equal(match[0], 'psql', `${entry.path}: ${match[0]} is not a read-only probe`);
    const [command, ...rest] = psqlArguments(entry, source, match.index - 1);
    assert.equal(command, "'psql'", entry.path);
    assert.deepEqual(rest.slice(-2), ["'-c'", "'select 1'"], `${entry.path}: ends with select 1`);
    const options = rest.slice(0, -2);
    const names = options.filter((_, at) => at % 2 === 0);
    assert.ok(options.length % 2 === 0 && new Set(names).size === names.length, entry.path);
    names.forEach((option, at) => {
      assert.ok(Object.hasOwn(PSQL_OPTIONS, option), `${entry.path}: option ${option}`);
      assert.match(options[2 * at + 1], PSQL_OPTIONS[option], `${entry.path}: ${option} value`);
    });
  }
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
    createHash('sha256').update(source).digest('hex'),
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

// Each kind's promise, checked against the file itself.
const KIND_CHECKS = new Map(
  Object.entries({
    launcher: checkNoClient,
    contract: checkNoClient,
    'read-only': checkReadOnly,
    probe: checkProbe,
    'container-local': checkContainerLocal,
    'pinned-read-probe': checkPinnedReadProbe,
    'owner-operation': checkOwnerOperation,
    residual: checkResidual,
  })
);

/** Applies the entry's kind to `source`; throws an assertion error when a promise is broken. */
export function checkEntry(entry, source) {
  const check = KIND_CHECKS.get(entry.kind);
  assert.ok(check, `${entry.path}: kind ${entry.kind}`);
  assert.ok(entry.reason?.length >= 40, `${entry.path}: reason`);
  if (entry.kind !== 'owner-operation') {
    assert.equal(entry.modules, undefined, `${entry.path}: only the owner operation has modules`);
  }
  check(entry, source);
}
