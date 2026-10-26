import { copyProducer } from './fixture-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const candidate = path.resolve(import.meta.dirname, '../../../..');
const artifact = path.resolve(import.meta.dirname, '../../../..');
function prepare() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-dispatch-test-')));
  copyProducer(artifact, root);
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/p2/policy.json')));
  for (const file of [...Object.keys(policy.sourceFiles), ...Object.keys(policy.dispatchFiles)]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(candidate, file), path.join(root, file));
  }
  const git = args =>
    execFileSync('/usr/bin/git', ['-C', root, ...args], {
      encoding: 'utf8',
      env: {
        PATH: '/usr/bin:/bin',
        HOME: root,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'P2 fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'P2 fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      },
    }).trim();
  git(['init', '--quiet']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'Synthetic protected fixture']);
  const commit = git(['rev-parse', 'HEAD']);
  git(['update-ref', 'refs/protected/main', commit]);
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  const producer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-producer-fixture-'))),
    output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-output-fixture-')));
  copyProducer(root, producer);
  return {
    root,
    producer,
    output,
    git,
    context: {
      version: 1,
      repository: 'interdomestik/interdomestik',
      eventName: 'push',
      baseCommit: commit,
      headCommit: commit,
      candidateCommit: commit,
      candidateTree: tree,
      sourceCommit: commit,
      sourceTree: tree,
      protectedMain: commit,
    },
    policy,
  };
}
async function fixture(callback) {
  const f = prepare();
  try {
    const module = await import(
      pathToFileURL(path.join(f.producer, 'scripts/ci/p2/runtime.mjs')).href
    );
    await callback(f, module);
  } finally {
    for (const root of [f.root, f.producer, f.output])
      fs.rmSync(root, { recursive: true, force: true });
  }
}
function args(f) {
  return {
    candidateRoot: f.root,
    producerRoot: f.producer,
    gitDir: path.join(f.root, '.git'),
    context: f.context,
    outputRoot: f.output,
  };
}
test('actual protected git/source authentication stops at unqualified Linux coverage; no output/exclusion', () =>
  fixture(async (f, m) => {
    await assert.rejects(
      m.runRequiredP2Runtime(args(f)),
      /coverage successor has not been qualified/
    );
    assert.equal(
      fs.readdirSync(f.root).some(n => n.startsWith('p2-')),
      false
    );
  }));
test('candidate source edit rejected against authenticated commit', () =>
  fixture(async (f, m) => {
    fs.appendFileSync(path.join(f.root, Object.keys(f.policy.sourceFiles)[0]), '\n// drift\n');
    await assert.rejects(m.runRequiredP2Runtime(args(f)), /input identity/);
  }));
test('producer policy tamper cannot qualify route', () =>
  fixture(async (f, m) => {
    const file = path.join(f.producer, 'scripts/ci/p2/policy.json');
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace('COVERAGE_SUCCESSOR_NOT_YET_EXECUTED', 'QUALIFIED_LINUX_ARM64_COVERAGE')
    );
    await assert.rejects(m.runRequiredP2Runtime(args(f)), /input identity/);
  }));
test('added untracked producer helper refused by exact-set census', () =>
  fixture(async (f, m) => {
    fs.writeFileSync(
      path.join(f.producer, 'scripts/ci/p2/foreign.mjs'),
      'export const credit=true;'
    );
    await assert.rejects(m.runRequiredP2Runtime(args(f)), /exact file set/);
  }));
test('wrong event source tree rejected', () =>
  fixture(async (f, m) => {
    const a = args(f);
    a.context = { ...a.context, sourceTree: '0'.repeat(40) };
    await assert.rejects(m.runRequiredP2Runtime(a), /wrong tree/);
  }));
test('serialized or cache-shaped handle cannot dispatch or exclude source', () =>
  fixture(async (f, m) => {
    let called = false;
    for (const handle of [
      { kind: 'fresh-p2-execution' },
      JSON.parse('{"reuse":true,"passed":true}'),
    ])
      await assert.rejects(
        m.withFreshP2Dispatch(
          handle,
          { context: f.context, discoveredSources: Object.keys(f.policy.sourceFiles) },
          () => {
            called = true;
          }
        ),
        /fresh same-event parent handle/
      );
    assert.equal(called, false);
  }));

test('added empty producer directory refused', () =>
  fixture(async (f, m) => {
    fs.mkdirSync(path.join(f.producer, 'scripts/ci/p2/foreign-empty'));
    await assert.rejects(m.runRequiredP2Runtime(args(f)), /exact directory set/);
  }));

test('overlapping candidate/producer authority roots rejected', () =>
  fixture(async (f, m) => {
    await assert.rejects(
      m.runRequiredP2Runtime({ ...args(f), producerRoot: f.root }),
      /authority roots must be disjoint/
    );
  }));
test('fixed producer materializer copies actual authenticated Git blobs only', () =>
  fixture(async f => {
    const { materializeRequiredP2Producer } = await import(
      pathToFileURL(path.join(f.producer, 'scripts/ci/p2/materialize-producer.mjs')).href
    );
    fs.writeFileSync(
      path.join(f.producer, 'scripts/ci/p2/untracked.mjs'),
      'throw Error("not authorized");'
    );
    const target = path.join(f.output, 'sealed');
    const result = materializeRequiredP2Producer({
      gitDir: path.join(f.root, '.git'),
      context: f.context,
      targetRoot: target,
    });
    assert.equal(result.nativeAdmission, false);
    assert.ok(result.files['scripts/ci/p2/capsule/dist/vendor.mjs']);
    assert.ok(result.files['scripts/ci/p2/coverage-vendor/dist/coverage-vendor.cjs']);
    assert.equal(fs.existsSync(path.join(target, 'scripts/ci/p2/untracked.mjs')), false);
    assert.deepEqual(
      fs.readFileSync(path.join(target, 'scripts/ci/p2/policy.json')),
      fs.readFileSync(path.join(f.root, 'scripts/ci/p2/policy.json'))
    );
    assert.throws(
      () =>
        materializeRequiredP2Producer({
          gitDir: path.join(f.root, '.git'),
          context: f.context,
          targetRoot: target,
        }),
      /must be fresh/
    );
  }));
