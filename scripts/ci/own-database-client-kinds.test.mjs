import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkClientAdapter,
  checkContainerLocal,
  checkEntry,
  checkGuarded,
  checkPinnedReadProbe,
  checkProbe,
  FACTORY_IMPORT_MODULE,
  FACTORY_IMPORT_ROLE,
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
  assert.throws(() => checkEntry(entry('residual'), source), /kind residual/u);
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

test('the readiness probe stays the until retry loop, after the one if check', () => {
  const probe = entry('probe', { path: 'scripts/m4-gatekeeper.sh' });
  const loop = /^([ \t]*)until node - <<'NODE'\n[\s\S]*?\n\1done$/mu.exec(m4)?.[0];
  assert.ok(loop, 'the reviewed until loop');
  const check = /^([ \t]*)if node - <<'NODE'\n[\s\S]*?\n\1fi$/mu.exec(m4)?.[0];
  for (const changed of [
    // The loop rewritten as a single check: same bodies, same count, no retry.
    m4.replace(
      loop,
      loop
        .replace(/^([ \t]*)until node/u, '$1if node')
        .replace(/^([ \t]*)do$/mu, '$1then')
        .replace(/^([ \t]*)done$/mu, '$1fi')
    ),
    // A loop that no longer waits or gives up, or another loop keyword.
    m4.replace(loop, loop.replace(/^[ \t]*sleep 1\n/mu, '')),
    m4.replace(loop, loop.replace('MAX_ATTEMPTS ]', 'MAX_ATTEMPTS + 1000 ]')),
    // The retry limit, set before the loop in the same function (round 6), or the attempt counter.
    m4.replace('local MAX_ATTEMPTS=60', 'local MAX_ATTEMPTS=1'),
    m4.replace('local ATTEMPT=0', 'local ATTEMPT=59'),
    m4.replace(loop, loop.replace(/^([ \t]*)until node/u, '$1while ! node')),
    // The two constructs swapped.
    m4.replace(check, '__CHECK__').replace(loop, check).replace('__CHECK__', loop),
  ]) {
    assert.notEqual(changed, m4);
    assert.throws(() => checkProbe(probe, changed), Error, changed.slice(0, 80));
  }
});

test('container-local runs no client command, loads no driver and reads no URL', () => {
  const local = entry('container-local');
  const status = "execFileSync(Z620_EXECUTABLES.docker, ['exec', container, 'pg_isready', '-q']);";
  assert.doesNotThrow(() => checkContainerLocal(local, status));
  for (const source of [
    "execFileSync(Z620_EXECUTABLES.docker, ['exec', container, 'psql', '-c', 'select 1']);",
    "execFileSync(Z620_EXECUTABLES.docker, ['exec', container, 'createdb', name]);",
    "import postgres from 'postgres';",
    'const url = process.env.DATABASE_URL;',
    "const sql = 'drop table claim';",
  ]) {
    assert.throws(() => checkContainerLocal(local, `${status}\n${source}`), Error, source);
  }
  const runner = readFileSync(join(root, 'scripts/ci/z620-runner.mjs'), 'utf8');
  assert.doesNotThrow(() => checkContainerLocal(local, runner));
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

test('a client adapter is the reviewed text: a second Drizzle call on another value is refused', () => {
  const path = 'packages/database/test/pg16/journal-migrator.ts';
  const kind = entry('client-adapter', { path });
  const real = readFileSync(join(root, path), 'utf8');
  assert.doesNotThrow(() => checkClientAdapter(kind, real));
  const overload = `${real}\nexport const open = (client: string) => drizzle(client);\n`;
  assert.throws(() => checkClientAdapter(kind, overload), /changed since its review/u);
  assert.throws(() => checkClientAdapter(entry('client-adapter'), real), /not a pinned adapter/u);
});

test('the release migration entry point must match its pinned bytes', () => {
  const path = 'scripts/ci/migration-phase/run.mjs';
  const kind = entry('pinned-release-migration', { path });
  const source = readFileSync(join(root, path), 'utf8');
  assert.doesNotThrow(() => checkEntry(kind, source));
  assert.throws(() => checkEntry(kind, `${source}\n`), /changed since its review/u);
  assert.throws(
    () => checkEntry(entry('pinned-release-migration'), source),
    /not a pinned release migration/u
  );
});

test('a guarded script opens clients only through the factory', () => {
  const kind = entry('guarded');
  const guarded =
    "import { openGuardedClient } from '../e2e-runtime-role.mjs';\nawait openGuardedClient(url, 'x');";
  assert.doesNotThrow(() => checkGuarded(kind, guarded));
  assert.throws(
    () => checkGuarded(kind, `${guarded}\nconst { default: postgres } = await import('postgres');`),
    /loads no driver/u
  );
  assert.throws(
    () => checkGuarded(kind, "await openGuardedClient(url, 'x');"),
    /imports the guarded factory/u
  );
});

test('the pinned guarded files require both their reviewed bytes and the guarded kind checks', () => {
  const dir = 'packages/database/test/pg16';
  const cases = [
    [
      'wp16-1-runtime-grants-opt-out.ts',
      source => source.replace('import type postgres', 'import postgres'),
    ],
    [
      'wp16-1-runtime-grants.test-support.ts',
      source => source.replace('drizzle(sql)', 'drizzle(url)'),
    ],
  ];
  for (const [file, change] of cases) {
    const path = `${dir}/${file}`;
    const kind = entry('pinned-guarded', { path });
    const source = readFileSync(join(root, path), 'utf8');
    assert.doesNotThrow(() => checkEntry(kind, source));
    const changed = change(source);
    assert.notEqual(changed, source);
    assert.throws(() => checkEntry(kind, changed), /changed since its review/u);
    assert.throws(
      () => checkEntry(entry('pinned-guarded'), source),
      /not a pinned guarded script/u
    );
    assert.throws(() => checkEntry(entry('guarded', { path }), source), /loads no driver/u);
  }
});

test('the factory is imported only in its two reviewed forms; a near miss of either is refused', () => {
  const role = "import { openGuardedClient } from '../e2e-runtime-role.mjs'";
  const module = "'../../src/disposable-client'";
  const nearMisses = [
    [
      FACTORY_IMPORT_MODULE,
      ["'disposable-client'", "'../src/disposable-clients'", "'@x/disposable-client'", "'../x.js'"],
    ],
    [
      FACTORY_IMPORT_ROLE,
      [
        "'e2e-runtime-role.mjs'",
        "import { openGuardedClient as o } from '../e2e-runtime-role.mjs'",
        "import { openGuardedClient } from 'e2e-runtime-role.mjs'",
      ],
    ],
  ];
  for (const s of [module, '"../src/disposable-client.ts"']) assert.match(s, FACTORY_IMPORT_MODULE);
  assert.match(role, FACTORY_IMPORT_ROLE);
  assert.doesNotMatch(role, FACTORY_IMPORT_MODULE);
  assert.doesNotMatch(module, FACTORY_IMPORT_ROLE);
  const call = "\nawait withDisposableClient(url, 'x', run);";
  const kind = entry('guarded');
  assert.doesNotThrow(() =>
    checkGuarded(kind, `import { withDisposableClient } from ${module};${call}`)
  );
  for (const [pattern, sources] of nearMisses) {
    for (const s of sources) {
      assert.doesNotMatch(s, pattern);
      assert.throws(
        () => checkGuarded(kind, `${s};${call}`),
        /scripts\/x\.mjs: imports the guarded factory/u
      );
    }
  }
});
