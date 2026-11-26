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
// The shell construct around each probe, in order: its keyword, and the sha256 of its text from
// the header of the enclosing function (so its settings before the probe, such as the retry limit,
// are covered) to the construct's closing fi or done. M4 checks once with `if`, then waits with the
// `until` retry loop; a rewrite of either (an `if` for the loop, a loop that no longer retries or
// gives up at another limit) is a change to review.
export const PINNED_PROBE_CONSTRUCTS = Object.freeze({
  'scripts/m4-gatekeeper.sh': Object.freeze([
    Object.freeze(['if', '94846577068ebb19633a1a3cefb8afb367781496cc2c13714158d22c472c1e14']),
    Object.freeze(['until', '63dba2366149cbe9eff03618649a918cc3a8051962b1f5df0a3ae378ed7dfccf']),
  ]),
});
const sha256 = text => createHash('sha256').update(text).digest('hex');
const FUNCTION = /^[A-Za-z_][\w-]*\(\) \{$/u;
const CLOSER = Object.freeze({ if: ['then', 'fi'], until: ['do', 'done'] });

// Each `if|until node - <<'NODE'` construct, read line by line: the heredoc body, then the
// keyword's own `then`/`do` at the same indent, then the first `fi`/`done` at that indent. Its text
// starts at the nearest function header above it (`name() {` at column 0).
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
    const header = lines.findLastIndex((line, index) => index < at && FUNCTION.test(line));
    found.push({
      keyword,
      body: bodyEnd < 0 ? '' : lines.slice(at + 1, bodyEnd).join('\n'),
      text: opened && last > bodyEnd && header >= 0 ? lines.slice(header, last + 1).join('\n') : '',
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
    '8a0d0ab5980d59a056e3cfc3073a49f46eff4a3df30d9a78d08492a3d59f88d5',
});

// Adapters pinned the same way: each uses the guarded client it is given and opens none.
// Drizzle's string and config overloads would connect, so the reviewed text is the promise.
export const PINNED_ADAPTERS = Object.freeze({
  'packages/database/test/pg16/journal-migrator.ts':
    '2fca263a0d67cf0b779f76ed6679c71f32ea5cace4e31c6611f4633b995d5ad4',
  'packages/database/test/pg16/wp16-1-runtime-grants-access.ts':
    '03096d35d222789259e561d44bdbff09591bd708ea787c9b62f056842bb22871',
  'packages/database/test/pg16/wp16-1-runtime-grants-rollback.ts':
    '49675a2ae561d82951da1e92416190de6f7eca5442ad30396f60274cdd8cc1f6',
});

const PINNED_GUARDED = Object.freeze({
  'packages/database/test/pg16/wp16-1-runtime-grants-opt-out.ts':
    '0696b586fb32ff7921edce55a8c8924e3129c78b4070aa0f48e3b5101bd038b0',
  'packages/database/test/pg16/wp16-1-runtime-grants.test-support.ts':
    'cad4b93a0e1390b8364756f7050baf18904c142d782455777630663f4dd803c6',
});
// The release entry point applies journaled migrations through admin connection preflight.
const PINNED_RELEASE_MIGRATIONS = Object.freeze({
  'scripts/ci/migration-phase/run.mjs':
    '15b7ae4cb684dbc942124488b3b99efa848d5c280f29b2633cdca3944f887c5c',
});

const pinnedCheck = (pins, what) => (entry, source) => {
  assert.ok(Object.hasOwn(pins, entry.path), `${entry.path}: not a pinned ${what}`);
  assert.equal(sha256(source), pins[entry.path], `${entry.path}: changed since its review`);
};
export const checkPinnedReadProbe = pinnedCheck(PINNED_READ_PROBES, 'probe');
export const checkClientAdapter = pinnedCheck(PINNED_ADAPTERS, 'adapter');
const checkGuardedPin = pinnedCheck(PINNED_GUARDED, 'guarded script');
const checkReleaseMigration = pinnedCheck(PINNED_RELEASE_MIGRATIONS, 'release migration');

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

// The guarded client factory (R-13): the one module that opens a client for a destructive script,
// imported directly (TypeScript) or through the role script's loader (JavaScript).
export const FACTORY_IMPORT_MODULE = /['"](?:\.\.?\/)+(?:src\/)?disposable-client(?:\.ts)?['"]/u;
export const FACTORY_IMPORT_ROLE =
  /\bimport\s*\{\s*openGuardedClient\s*\}\s*from\s*['"](?:\.\.?\/)+e2e-runtime-role\.mjs['"]/u;
const FACTORY_CALL = /\b(?:withDisposableClient|openDisposableClient|openGuardedClient)\s*[(<]/u;

export function checkGuarded(entry, source) {
  // Takes every client from the factory; loads no driver and runs no client command itself.
  const imports = FACTORY_IMPORT_MODULE.test(source) || FACTORY_IMPORT_ROLE.test(source);
  assert.ok(imports, `${entry.path}: imports the guarded factory`);
  assert.match(source, FACTORY_CALL, `${entry.path}: opens clients through it`);
  assert.equal(loadsDriver(source), false, `${entry.path}: loads no driver`);
  assert.deepEqual(commands(source), [], entry.path);
}

// These files open clients through the factory and name a driver for types or for wrapping an
// existing guarded client. Check the complete pin before discounting the single reviewed import.
const PINNED_GUARDED_IMPORT =
  /^import (?:type postgres from ['"]postgres['"]|\{ drizzle \} from ['"]drizzle-orm\/postgres-js['"]);$/mu;

function checkPinnedGuarded(entry, source) {
  checkGuardedPin(entry, source);
  checkGuarded(entry, source.replace(PINNED_GUARDED_IMPORT, ''));
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
    case 'guarded':
      return checkGuarded(entry, source);
    case 'pinned-guarded':
      return checkPinnedGuarded(entry, source);
    case 'client-adapter':
      return checkClientAdapter(entry, source);
    case 'pinned-release-migration':
      checkNoClient(entry, source);
      return checkReleaseMigration(entry, source);
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
