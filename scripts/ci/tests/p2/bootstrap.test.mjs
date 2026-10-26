import { copyProducer } from './fixture-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runRequiredP2Coverage, takeFreshP2CoverageForJoin } from '../../p2/ordinary-dispatch.mjs';
import {
  runBootstrappedP2Coverage,
  takeBootstrappedP2CoverageForJoin,
  takeP2BootstrapInvocation,
} from '../../p2/bootstrap.mjs';
import { runOrdinaryCoverageJob } from '../../p2/ordinary-job.mjs';

const proposal = path.resolve(import.meta.dirname, '../../../..');
function fixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-bootstrap-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const candidateRoot = path.join(temp, 'candidate'),
    producerRoot = path.join(temp, 'producer'),
    outputRoot = path.join(temp, 'output');
  for (const root of [candidateRoot, producerRoot, outputRoot]) fs.mkdirSync(root);
  copyProducer(proposal, candidateRoot);
  copyProducer(proposal, producerRoot);
  const git = args =>
    execFileSync('/usr/bin/git', ['-C', candidateRoot, ...args], {
      encoding: 'utf8',
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      },
    }).trim();
  git(['init', '--quiet']);
  git(['add', '--force', '.']);
  git(['commit', '--quiet', '-m', 'fixed producer']);
  const base = git(['rev-parse', 'HEAD']),
    tree = git(['rev-parse', 'HEAD^{tree}']);
  git(['commit', '--allow-empty', '--quiet', '-m', 'candidate']);
  const head = git(['rev-parse', 'HEAD']);
  const merge = git(['commit-tree', tree, '-p', base, '-p', head, '-m', 'synthetic PR merge']);
  git(['update-ref', 'refs/protected/main', base]);
  const options = {
    candidateRoot,
    producerRoot,
    outputRoot,
    gitDir: path.join(candidateRoot, '.git'),
    ordinaryRunId: 1,
    ordinaryRunAttempt: 1,
    context: {
      version: 1,
      repository: 'interdomestik/interdomestik',
      eventName: 'pull_request',
      baseCommit: base,
      headCommit: head,
      candidateCommit: merge,
      candidateTree: tree,
      sourceCommit: base,
      sourceTree: tree,
      protectedMain: base,
    },
  };
  return {
    ...options,
    options,
    git,
    load: () => import(pathToFileURL(path.join(producerRoot, 'scripts/ci/p2/bootstrap.mjs')).href),
  };
}
test('PR entry, bootstrap, ordinary partition and join reject push before IO', async () => {
  const options = { context: { eventName: 'push' } };
  await assert.rejects(runRequiredP2Coverage(options), /pull_request/);
  await assert.rejects(runBootstrappedP2Coverage(options), /pull_request/);
  assert.throws(() => takeFreshP2CoverageForJoin({}, options.context), /pull_request/);
  assert.throws(() => takeBootstrappedP2CoverageForJoin({}, options.context), /pull_request/);
  const previous = process.env.GITHUB_EVENT_NAME;
  process.env.GITHUB_EVENT_NAME = 'push';
  try {
    await assert.rejects(runOrdinaryCoverageJob(), /pull_request only/);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_EVENT_NAME;
    else process.env.GITHUB_EVENT_NAME = previous;
  }
});
test('direct PR API cannot forge the private bootstrap invocation', async () => {
  const fake = { context: { eventName: 'pull_request' } };
  await assert.rejects(runRequiredP2Coverage(fake), /private authenticated invocation/);
  assert.throws(
    () => takeP2BootstrapInvocation(JSON.parse(JSON.stringify(fake))),
    /private authenticated invocation/
  );
  assert.throws(
    () => takeBootstrappedP2CoverageForJoin({ freshP2: true }, fake.context),
    /fresh bootstrapped result/
  );
});
test('actual full source/PR authentication reaches metadata-token boundary without network or runtime', async t => {
  const f = fixture(t),
    module = await f.load(),
    previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    await assert.rejects(
      module.runBootstrappedP2Coverage(f.options),
      /protected artifact read token absent/
    );
  } finally {
    if (previous !== undefined) process.env.GITHUB_TOKEN = previous;
  }
});
for (const file of [
  'scripts/ci/p2/ordinary-artifact.mjs',
  'scripts/ci/p2/unpack-ordinary.py',
  'scripts/ci/db-access-provider-runtime-identity.mjs',
  'scripts/ci/coverage-gate.mjs',
  'scripts/ci/clean-coverage-artifacts.mjs',
])
  test('tampered closure refused before parser/helper evaluation: ' + file, async t => {
    const f = fixture(t),
      module = await f.load();
    const marker = path.join(f.outputRoot, 'evaluated');
    const target = path.join(f.producerRoot, file);
    const probe = file.endsWith('.py')
      ? 'from pathlib import Path; Path(' + JSON.stringify(marker) + ').write_text("unexpected")\n'
      : "import {writeFileSync as p2UnexpectedWrite} from 'node:fs'; p2UnexpectedWrite(" +
        JSON.stringify(marker) +
        ',"unexpected");\n';
    fs.writeFileSync(target, probe + fs.readFileSync(target, 'utf8'));
    await assert.rejects(module.runBootstrappedP2Coverage(f.options), /producer input identity/);
    assert.equal(fs.existsSync(marker), false);
  });
test('bootstrap bytes changed after trusted import are refused', async t => {
  const f = fixture(t),
    module = await f.load();
  fs.appendFileSync(path.join(f.producerRoot, 'scripts/ci/p2/bootstrap.mjs'), '\n// changed\n');
  await assert.rejects(module.runBootstrappedP2Coverage(f.options), /producer input identity/);
});
test('wrong producer tree rejected before helper import', async t => {
  const f = fixture(t),
    module = await f.load();
  await assert.rejects(
    module.runBootstrappedP2Coverage({
      ...f.options,
      context: { ...f.context, sourceTree: '0'.repeat(40) },
    }),
    /unprotected source/
  );
});
test('valid PR structure is authenticated before artifact parser runs', async t => {
  const f = fixture(t),
    module = await f.load();
  await assert.rejects(
    module.runBootstrappedP2Coverage({
      ...f.options,
      context: { ...f.context, headCommit: f.context.baseCommit },
    }),
    /merge event parents/
  );
});
for (const [name, alter, expected] of [
  [
    'untracked root file',
    f => fs.writeFileSync(path.join(f.producerRoot, 'foreign.mjs'), ''),
    /filesystem census/,
  ],
  [
    'untracked extra helper',
    f => fs.writeFileSync(path.join(f.producerRoot, 'scripts/ci/foreign.mjs'), ''),
    /filesystem census/,
  ],
  [
    'empty extra directory',
    f => fs.mkdirSync(path.join(f.producerRoot, 'empty')),
    /filesystem census/,
  ],
  [
    'executable mode drift',
    f => fs.chmodSync(path.join(f.producerRoot, 'scripts/ci/coverage-gate.mjs'), 0o755),
    /input identity/,
  ],
  [
    'missing external helper',
    f => fs.unlinkSync(path.join(f.producerRoot, 'scripts/ci/clean-coverage-artifacts.mjs')),
    /ambiguous producer path/,
  ],
  [
    'external helper symlink',
    f => {
      const p = path.join(f.producerRoot, 'scripts/ci/coverage-gate.mjs');
      fs.unlinkSync(p);
      fs.symlinkSync(path.join(f.candidateRoot, 'scripts/ci/coverage-gate.mjs'), p);
    },
    /producer symlink/,
  ],
])
  test('complete closure refuses ' + name, async t => {
    const f = fixture(t),
      module = await f.load();
    alter(f);
    await assert.rejects(module.runBootstrappedP2Coverage(f.options), expected);
  });
test('bootstrap from another root cannot authenticate a different loaded module', async t => {
  const f = fixture(t);
  await assert.rejects(runBootstrappedP2Coverage(f.options), /loaded outside fixed producer/);
});
