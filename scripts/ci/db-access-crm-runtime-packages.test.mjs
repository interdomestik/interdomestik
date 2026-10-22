import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  build,
  host,
  only,
  sha256,
  PATCH,
  PATCHED,
  EXTRA_TARGET,
} from './db-access-crm-runtime-package-fixture.mjs';

test('materializes the exact pnpm graph into isolated slots', only, t => {
  const f = build(t);
  const result = f.install();
  assert.equal(result.host, host.key);
  assert.equal(result.installed, 6);
  assert.equal(result.policyActivated, false);
  assert.deepEqual(Object.keys(result.omitted), [f.ids.alien]);
  assert.equal(result.omitted[f.ids.alien].reason, 'platform');
  assert.ok(!fs.existsSync(path.join(f.root, 'node_modules/.crm', f.ids.alien)));
  assert.ok(!fs.existsSync(path.join(f.root, 'node_modules/alien')));
  const slot = (id, name) => path.join(f.root, 'node_modules/.crm', id, 'node_modules', name);
  assert.equal(
    fs.realpathSync(path.join(f.root, 'node_modules/alpha')),
    slot(f.ids.alpha, 'alpha')
  );
  assert.equal(
    fs.realpathSync(path.join(f.root, 'node_modules/esbuild')),
    slot(f.ids.esbuild, 'esbuild')
  );
  assert.equal(
    fs.readlinkSync(
      path.join(f.root, 'node_modules/.crm', f.ids.beta, 'node_modules/@scope/gamma')
    ),
    '../../../' + f.ids.gamma + '/node_modules/@scope/gamma'
  );
  assert.equal(fs.realpathSync(slot(f.ids.alpha, 'native')), slot(f.ids.native, 'native'));
  const own = slot(f.ids.beta, 'beta');
  assert.ok(fs.lstatSync(own).isDirectory());
  assert.equal(fs.readFileSync(path.join(own, 'index.js'), 'utf8'), PATCHED);
  assert.equal(result.patches[f.ids.beta].patchedFiles['index.js'], sha256(PATCHED));
  assert.deepEqual(result.patches[f.ids.beta].targets, ['index.js']);
  assert.equal(result.packages[f.ids.gamma].name, '@scope/gamma');
  assert.equal(result.compiler.package, host.compiler);
  assert.equal(result.compiler.version, '0.28.2');
  assert.equal(result.compiler.sha256, sha256('esbuild-native-stub\n'));
  assert.ok(fs.statSync(result.compiler.binary).mode & 0o111);
  assert.equal(fs.readFileSync(result.compiler.binary, 'utf8'), 'esbuild-native-stub\n');
  assert.ok(result.compiler.binary.startsWith(f.root + path.sep));
});

test('a required slot for another platform refuses instead of omitting it', only, t => {
  assert.throws(
    () => build(t, { requireAlien: true }).install(),
    /unsupported required slot alien@1\.0\.0/u
  );
});

test('a record not keyed by sha256(snapshot) refuses', only, t => {
  const f = build(t, {
    mutate: (lock, ids) => (lock.packages[ids.gamma].snapshot = '@scope/gamma@2.0.1'),
  });
  assert.throws(() => f.install(), /record key/u);
});

test('a dependency pointing outside the graph refuses', only, t => {
  const f = build(t, {
    mutate: (lock, ids) => (lock.packages[ids.alpha].dependencies.beta = 'f'.repeat(64)),
  });
  assert.throws(() => f.install(), /unknown dependency slot beta/u);
});

test('a dependency edge naming a different package refuses', only, t => {
  const f = build(t, {
    mutate: (lock, ids) => (lock.packages[ids.alpha].dependencies.beta = ids.gamma),
  });
  assert.throws(() => f.install(), /dependency edge name beta/u);
});

test('a self dependency on a different peer instance refuses', only, t => {
  assert.throws(
    () => build(t, { peerBeta: true }).install(),
    /self dependency instance beta@1\.0\.0/u
  );
});

test('a tampered archive refuses before extraction', only, t => {
  assert.throws(
    () => build(t, { corrupt: '@scope/gamma' }).install(),
    /archive integrity @scope\/gamma/u
  );
});

test('an escaping tar member refuses', only, t => {
  const f = build(t, {
    entries: {
      '@scope/gamma': [
        { name: 'package/', type: '5', mode: 0o755 },
        {
          name: 'package/package.json',
          body: JSON.stringify({ name: '@scope/gamma', version: '2.0.0' }),
        },
        { name: 'package/../../evil.js', body: 'x' },
      ],
    },
  });
  assert.throws(() => f.install(), /archive member path/u);
});

test('a symlink tar member refuses', only, t => {
  const f = build(t, {
    entries: {
      '@scope/gamma': [
        { name: 'package/', type: '5', mode: 0o755 },
        {
          name: 'package/package.json',
          body: JSON.stringify({ name: '@scope/gamma', version: '2.0.0' }),
        },
        { name: 'package/escape', type: '2', link: '/etc/passwd' },
      ],
    },
  });
  assert.throws(() => f.install(), /archive member type/u);
});

test('a device tar member refuses', only, t => {
  const f = build(t, {
    entries: {
      '@scope/gamma': [
        { name: 'package/', type: '5', mode: 0o755 },
        {
          name: 'package/package.json',
          body: JSON.stringify({ name: '@scope/gamma', version: '2.0.0' }),
        },
        { name: 'package/dev', type: '3' },
      ],
    },
  });
  assert.throws(() => f.install(), /archive member type/u);
});

test('a manifest disagreeing with the slot refuses', only, t => {
  const f = build(t, {
    entries: {
      '@scope/gamma': [
        { name: 'package/', type: '5', mode: 0o755 },
        {
          name: 'package/package.json',
          body: JSON.stringify({ name: '@scope/gamma', version: '9.9.9' }),
        },
      ],
    },
  });
  assert.throws(() => f.install(), /package manifest @scope\/gamma/u);
});

test('a wrong patched file digest refuses after patching', only, t => {
  const f = build(t, { patchedFiles: { 'index.js': '0'.repeat(64) } });
  assert.throws(() => f.install(), /patched file identity/u);
});

test('a patch target without a pinned digest refuses before patching', only, t => {
  const f = build(t, { patchText: PATCH + EXTRA_TARGET });
  assert.throws(() => f.install(), /unverified patch target other\.js/u);
});

test('a patched file path escaping the package refuses', only, t => {
  const f = build(t, { patchedFiles: { '../index.js': sha256(PATCHED) } });
  assert.throws(() => f.install(), /patched file \.\./u);
});

test('an altered candidate patch refuses', only, t => {
  const f = build(t);
  fs.writeFileSync(path.join(f.source, 'patches/beta@1.0.0.patch'), PATCH + '\n');
  assert.throws(() => f.install(), /input identity patches\/beta@1\.0\.0\.patch/u);
});

test('a lock whose digest does not match the candidate refuses', only, t => {
  const f = build(t, { sourceLockSha256: '0'.repeat(64) });
  assert.throws(() => f.install(), /input identity pnpm-lock\.yaml/u);
});

test('an unversioned lock refuses', only, t => {
  assert.throws(() => build(t, { version: 2 }).install(), /lock version/u);
});

test('an ancestor node_modules refuses the assembly', only, t => {
  const f = build(t);
  fs.mkdirSync(path.join(f.base, 'node_modules'));
  assert.throws(() => f.install(), /ancestor node_modules/u);
});

test('an inherited NODE_PATH refuses', only, t => {
  const f = build(t);
  const prior = process.env.NODE_PATH;
  process.env.NODE_PATH = '/tmp';
  t.after(() => {
    if (prior === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = prior;
  });
  assert.throws(() => f.install(), /inherited NODE_PATH/u);
});

test('an existing node_modules refuses reuse', only, t => {
  const f = build(t);
  fs.mkdirSync(path.join(f.root, 'node_modules'));
  assert.throws(() => f.install(), /existing node_modules/u);
});

test('a missing esbuild root refuses', only, t => {
  const f = build(t, { mutate: lock => delete lock.roots.esbuild });
  assert.throws(() => f.install(), /missing esbuild root/u);
});

test('internal dot components remain inside the authenticated package', only, t => {
  const f = build(t, {
    entries: {
      '@scope/gamma': [
        { name: 'package/', type: '5', mode: 0o755 },
        {
          name: 'package/./package.json',
          body: JSON.stringify({ name: '@scope/gamma', version: '2.0.0' }),
        },
      ],
    },
  });
  assert.equal(f.install().packages[f.ids.gamma].name, '@scope/gamma');
});
test('a nested peer patch marker does not patch the parent package', only, t => {
  const f = build(t, {
    mutate: (lock, ids) => {
      const record = lock.packages[ids.alpha];
      delete lock.packages[ids.alpha];
      record.snapshot += '(' + lock.packages[ids.beta].snapshot + ')';
      const id = sha256(record.snapshot);
      lock.packages[id] = record;
      lock.roots.alpha = id;
    },
  });
  assert.equal(f.install().installed, 6);
});

test('registry manifest semver v prefix keeps the exact numeric version', only, t => {
  const f = build(t, {
    entries: {
      '@scope/gamma': [
        { name: 'package/', type: '5', mode: 0o755 },
        {
          name: 'package/package.json',
          body: JSON.stringify({ name: '@scope/gamma', version: 'v2.0.0' }),
        },
      ],
    },
  });
  assert.equal(f.install().packages[f.ids.gamma].version, '2.0.0');
});
