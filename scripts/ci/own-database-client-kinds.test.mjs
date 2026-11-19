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

const m4 = readFileSync(join(root, 'scripts/m4-gatekeeper.sh'), 'utf8');
const [, reviewed] = /<<'NODE'\n([\s\S]*?)\nNODE$/mu.exec(m4) ?? [];

test('a probe body is the reviewed one, run as a condition, as often as pinned', () => {
  const probe = entry('probe', { path: 'scripts/m4-gatekeeper.sh' });
  assert.equal([...m4.matchAll(/require\('postgres'\)/gu)].length, 2, 'both M4 connections');
  assert.doesNotThrow(() => checkProbe(probe, m4));
  for (const body of [
    reviewed.replace('select 1', 'delete from claim'),
    // Readiness without a query: the query spelling only as an ordinary string.
    reviewed.replace(/^sql`select 1`\.then/mu, "Promise.resolve('sql`select 1`').then"),
    `${reviewed}\nsql.unsafe('drop table claim');`,
    `${reviewed} `,
  ]) {
    assert.notEqual(body, reviewed);
    const changed = m4.replace(reviewed, body);
    assert.throws(() => checkProbe(probe, changed), /a reviewed probe body/u, body);
  }
  // Either probe removed, or run without its exit status deciding.
  const [first, second] = [...m4.matchAll(/^.*<<'NODE'\n[\s\S]*?\nNODE\n.*$/gmu)].map(m => m[0]);
  for (const removed of [first, second]) {
    assert.throws(() => checkProbe(probe, m4.replace(removed, 'true')), /probes/u);
  }
  const unhooked = m4.replace(
    first,
    first.replace(/^(\s*)if node/u, '$1node').replace(/then$/u, '')
  );
  assert.throws(() => checkProbe(probe, unhooked), /each probe is a condition/u);
  const outside = `${m4}node -e "require('postgres')"\n`;
  assert.throws(() => checkProbe(probe, outside), /no driver outside the probes/u);
  assert.throws(() => checkProbe(entry('probe'), m4), /not a pinned probe/u);
});

const ENV = "'env', '-i', 'PATH=/usr/bin:/bin',";
const exec = (argv, after = '') =>
  `execFileSync(Z620_EXECUTABLES.docker, [\n  'exec',\n  container,\n  ${ENV} ${argv}\n]${after});`;
const FIXED = "'-X', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-d', name,";
const psql = options => `'psql', ${FIXED} ${options} '-c', 'select 1',`;

test('container-local runs only psql -c select 1 through docker exec', () => {
  const local = entry('container-local');
  assert.doesNotThrow(() => checkContainerLocal(local, exec(psql("'-v', 'ON_ERROR_STOP=1',"))));
  for (const argv of [
    "'createdb',\n  '-U',\n  'postgres',\n  name,",
    "'dropdb',\n  '--force',\n  name,",
    `'psql', ${FIXED} '-c', 'drop database x',`,
    `'psql', ${FIXED} '-f', 'dump.sql',`,
    `${psql('')} '-c', 'drop table claim',`,
    psql("'--command=select 2',"),
    psql("'-d', 'a', '-d', 'b',"),
    psql('...extra,'),
    psql("'-v',"),
    psql("'-v', 'ON_ERROR_STOP=0',"),
    `${psql('')} '-o', '/tmp/x',`,
    // Each required option missing or changed: a psqlrc may run, or the environment may choose.
    ...[
      "'-X',",
      "'-h', '/var/run/postgresql',",
      "'-p', '5432',",
      "'-U', 'postgres',",
      "'-d', name,",
    ].map(option => `'psql', ${FIXED.replace(option, '')} '-c', 'select 1',`),
    `'psql', ${FIXED.replace('/var/run/postgresql', 'db.example')} '-c', 'select 1',`,
  ]) {
    assert.throws(() => checkContainerLocal(local, exec(argv)), Error, argv);
  }
  // Nothing may extend the list after its closing bracket, nor pass a second argument.
  for (const after of [".concat(['-c', 'select 2'])", ', { shell: true }', '.slice(0)']) {
    assert.throws(() => checkContainerLocal(local, exec(psql(''), after)), Error, after);
  }
  // Without env -i, or with an environment of the caller's, the container's PG* variables apply.
  for (const env of ['', "'env', '-i', path,", "'env', 'PGHOSTADDR=10.0.0.1',"]) {
    assert.throws(() => checkContainerLocal(local, exec(psql('')).replace(ENV, env)), Error, env);
  }
  assert.throws(
    () => checkContainerLocal(local, "execFileSync('psql', ['-c', 'select 1'])"),
    /one docker call/u
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
