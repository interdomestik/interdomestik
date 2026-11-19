import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkContainerLocal,
  checkEntry,
  checkPinnedReadProbe,
  checkProbe,
  OWNER_OPERATIONS,
  ownerWorkflowProblems,
  root,
} from './own-database-client-rules.mjs';

// CHK-13 (R-13): each kind refuses what breaks its promise. The inventory itself is checked by
// own-database-client.test.mjs.
const reason = 'A reason long enough to stand as the reviewed reason of this entry.';
const entry = (kind, extra = {}) => ({ path: 'scripts/x.mjs', kind, reason, ...extra });

test('only the pinned owner operation may carry modules', () => {
  const source = "import { run } from './helper.mjs';";
  assert.doesNotThrow(() => checkEntry(entry('launcher'), source));
  assert.throws(
    () => checkEntry(entry('launcher', { modules: ['scripts/helper.mjs'] }), source),
    /only the owner operation has modules/u
  );
  assert.throws(() => checkEntry(entry('unknown'), source), /kind unknown/u);
  assert.throws(
    () => checkEntry(entry('residual'), "throw new Error('must target a loopback host')"),
    /follow-up/u
  );
});

const probeScript = (body = 'sql`select 1`.then(() => sql.end())') =>
  ["const postgres = require('postgres');", 'const sql = postgres(process.env.URL);', body].join(
    '\n'
  );
const heredoc = script => `if node - <<'NODE'\n${script}\nNODE\nthen\n  return 0\nfi\n`;

test('a probe runs only select 1 on the one client each embedded script opens', () => {
  const probe = entry('probe');
  assert.doesNotThrow(() => checkProbe(probe, heredoc(probeScript()) + heredoc(probeScript())));
  for (const body of [
    'sql`select 1`; sql`delete from claim`',
    'sql.unsafe("drop table claim")',
    'sql`select 1`; const other = postgres(process.env.URL); other`select 1`',
    'sql`select 1`; sql("x")',
    'sql`select 1`; sql.begin(async t => t`select 1`)',
    'Promise.resolve(); // sql`select 1`',
    'Promise.resolve(); /* sql`select 1` */',
  ]) {
    assert.throws(() => checkProbe(probe, heredoc(probeScript(body))), Error, body);
  }
  const outside = `${heredoc(probeScript())}node -e "require('postgres')"\n`;
  assert.throws(() => checkProbe(probe, outside), /no driver outside the probes/u);
  assert.throws(() => checkProbe(probe, 'echo nothing'), /probes/u);
  const m4 = readFileSync(join(root, 'scripts/m4-gatekeeper.sh'), 'utf8');
  assert.equal([...m4.matchAll(/require\('postgres'\)/gu)].length, 2, 'both M4 connections');
  assert.doesNotThrow(() => checkProbe(probe, m4));
});

const exec = argv =>
  `execFileSync(Z620_EXECUTABLES.docker, [\n  'exec',\n  container,\n  ${argv}\n]);`;

test('container-local runs only psql -c select 1 through docker exec', () => {
  const local = entry('container-local');
  assert.doesNotThrow(() =>
    checkContainerLocal(local, exec("'psql',\n  '-U',\n  'postgres',\n  '-c',\n  'select 1',"))
  );
  for (const argv of [
    "'createdb',\n  '-U',\n  'postgres',\n  name,",
    "'dropdb',\n  '--force',\n  name,",
    "'psql',\n  '-c',\n  'drop database x',",
    "'psql',\n  '-f',\n  'dump.sql',",
    "'psql',\n  '-c',\n  'select 1',\n  '-c',\n  'drop table claim',",
    "'psql',\n  '--command=select 2',\n  '-c',\n  'select 1',",
    "'psql',\n  '-d',\n  'a',\n  '-d',\n  'b',\n  '-c',\n  'select 1',",
    "'psql',\n  ...extra,\n  '-c',\n  'select 1',",
    "'psql',\n  '-U',\n  '-c',\n  'select 1',",
    "'psql',\n  '-v',\n  'ON_ERROR_STOP=0',\n  '-c',\n  'select 1',",
    "'psql',\n  '-c',\n  'select 1', '-o', '/tmp/x',",
  ]) {
    assert.throws(() => checkContainerLocal(local, exec(argv)), Error, argv);
  }
  assert.throws(
    () => checkContainerLocal(local, "execFileSync('psql', ['-c', 'select 1'])"),
    /through docker exec/u
  );
  const smoke = readFileSync(join(root, 'scripts/ci/z620-resource-smoke.mjs'), 'utf8');
  assert.doesNotThrow(() => checkContainerLocal(local, smoke));
});

test('a pinned read probe is refused once its bytes change', () => {
  const path = 'scripts/ci/verify-machine-docker.mjs';
  const source = readFileSync(join(root, path), 'utf8');
  assert.doesNotThrow(() => checkPinnedReadProbe(entry('pinned-read-probe', { path }), source));
  assert.throws(
    () => checkPinnedReadProbe(entry('pinned-read-probe', { path }), `${source}\n`),
    /changed since its review/u
  );
  assert.throws(
    () => checkPinnedReadProbe(entry('pinned-read-probe'), source),
    /not a pinned probe/u
  );
});

const pinned = OWNER_OPERATIONS[0];
const realWorkflow = readFileSync(join(root, pinned.workflow), 'utf8');

test('the owner operation runs only in its own main-only, staging job', () => {
  assert.deepEqual(ownerWorkflowProblems(realWorkflow, pinned), []);
  const condition = /^ {4}if: .*refs\/heads\/main.*$/mu;
  assert.match(realWorkflow, condition);
  // The main-ref condition moved from the job to another step of the same job.
  const onStep = realWorkflow
    .replace(condition, "    if: ${{ github.event_name == 'workflow_dispatch' }}")
    .replace(
      /^ {4}steps:\n/mu,
      "    steps:\n      - if: ${{ github.ref == 'refs/heads/main' }}\n        run: echo\n"
    );
  assert.deepEqual(ownerWorkflowProblems(onStep, pinned), [
    'the job is not main-only and dispatched',
  ]);
  const noEnvironment = realWorkflow.replace(/^ {4}environment:\n {6}name: staging\n/mu, '');
  assert.deepEqual(ownerWorkflowProblems(noEnvironment, pinned), [
    'the job does not run in the staging environment',
  ]);
  const pushed = realWorkflow.replace(/^on:\n/mu, 'on:\n  push:\n');
  assert.deepEqual(ownerWorkflowProblems(pushed, pinned), [
    'the trigger is not workflow_dispatch alone',
  ]);
  const secondJob = `${realWorkflow.trimEnd()}\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node ${pinned.path}\n`;
  assert.deepEqual(ownerWorkflowProblems(secondJob, pinned), [
    `the operation is not invoked by job ${pinned.job} alone`,
  ]);
  // The invocation only in a comment, or as text after another command, is no invocation.
  const invocation = `run: node ${pinned.path}`;
  assert.ok(realWorkflow.includes(invocation));
  for (const line of [`run: echo # node ${pinned.path}`, `# ${invocation}`]) {
    assert.deepEqual(ownerWorkflowProblems(realWorkflow.replace(invocation, line), pinned), [
      `the operation is not invoked by job ${pinned.job} alone`,
    ]);
  }
});
