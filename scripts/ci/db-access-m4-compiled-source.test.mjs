import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import fixed from './db-access-m4-compiled-contract.json' with { type: 'json' };
import { deriveM4CompiledFixtureSource } from './db-access-m4-compiled-source.mjs';
import { ownedTarget, verifyInstalledClosure } from './m4-compiled-fixture/preparation-custody.mjs';
import { prepareCompiledFixture } from './m4-compiled-fixture/prepare-build.mjs';
const root = fs.realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const all = [
  ...Object.keys(fixed.projectFiles),
  ...Object.keys(fixed.producerHelpers),
  ...Object.keys(fixed.candidateFiles),
];
function fixture() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-source-check-')));
  for (const file of all) {
    const dest = path.join(dir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, file), dest);
    fs.chmodSync(dest, 0o644);
  }
  return dir;
}
function changed(label, mutate) {
  test(label, () => {
    const dir = fixture();
    try {
      mutate(dir);
      assert.throws(() => deriveM4CompiledFixtureSource({ producerRoot: dir, candidateRoot: dir }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
test('actual fixed sources derive three local action facts without runtime authority', () => {
  const result = deriveM4CompiledFixtureSource({ producerRoot: root, candidateRoot: root });
  assert.deepEqual(
    result.actions.map(x => [x.name, x.profile]),
    [
      ['runAdminAssignment', 'legacy-admin'],
      ['runAgentAssignment', 'legacy-agent'],
      ['runStaffAssignment', 'staff'],
    ]
  );
  assert.equal(result.projectFileCount, 32);
  assert.equal(result.candidateFileCount, 13);
  assert.equal(result.installedClosureSha256, fixed.installedClosure.sha256);
  assert.equal(result.browserBinaryBound, false);
  assert.equal(result.runtimeAdmission, false);
  assert.equal(result.nativeAdmission, false);
  assert.equal(result.productionCCredit, 0);
});
changed('foreign candidate vendor source refuses', dir =>
  fs.appendFileSync(path.join(dir, fixed.vendorCorrespondence[0].candidate), '\n// drift')
);
changed('foreign producer vendor copy refuses', dir =>
  fs.appendFileSync(path.join(dir, fixed.vendorCorrespondence[0].producer), '\n// drift')
);
changed('tampered action implementation refuses', dir =>
  fs.appendFileSync(
    path.join(dir, 'scripts/ci/m4-compiled-fixture/project/app/actions.js'),
    '\n// drift'
  )
);
changed('missing fixed preparation helper refuses', dir =>
  fs.rmSync(path.join(dir, 'scripts/ci/m4-compiled-fixture/package-graph.mjs'))
);
changed('wrong executable mode on a fixed project file refuses', dir =>
  fs.chmodSync(path.join(dir, 'scripts/ci/m4-compiled-fixture/project/app/actions.js'), 0o755)
);
changed('symlinked fixed project source refuses', dir => {
  const file = path.join(dir, 'scripts/ci/m4-compiled-fixture/project/app/actions.js');
  fs.renameSync(file, file + '.saved');
  fs.symlinkSync(file + '.saved', file);
});
test('source failure precedes creation of an owned preparation child', () => {
  const dir = fixture(),
    parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-prep-parent-')));
  const name = 'm4-compiled-11111111-1111-4111-8111-111111111111';
  try {
    fs.appendFileSync(path.join(dir, fixed.vendorCorrespondence[0].producer), '\n// drift');
    assert.throws(() =>
      prepareCompiledFixture({
        candidateRoot: dir,
        producerRoot: dir,
        ownedParent: parent,
        targetName: name,
      })
    );
    assert.equal(fs.existsSync(path.join(parent, name)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
test('owned target is a fresh physical 0700 UUID-named direct child', () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-target-parent-'))),
    name = 'm4-compiled-11111111-1111-4111-8111-111111111111';
  try {
    assert.equal(ownedTarget(parent, name), path.join(parent, name));
    assert.throws(() => ownedTarget(parent, '../foreign'));
    fs.mkdirSync(path.join(parent, name), { mode: 0o700 });
    assert.throws(() => ownedTarget(parent, name));
    assert.equal(ownedTarget(parent, name, true), path.join(parent, name));
    fs.chmodSync(parent, 0o755);
    assert.throws(() => ownedTarget(parent, 'm4-compiled-22222222-2222-4222-8222-222222222222'));
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
test('empty or substituted installed tree refuses without a compiler or build', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-empty-image-')));
  try {
    assert.throws(
      () => verifyInstalledClosure(dir),
      /Fixed installed compiler\/browser package closure refused/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('canonical fixture plan gate refuses off-plan commands while retaining operation identity', async () => {
  const { matchQualificationInput } =
    await import('./m4-compiled-fixture/project/app/fixture-scope.js');
  const id = '11111111-1111-4111-8111-111111111111';
  const plan = {
    version: 1,
    runId: id,
    scenarios: ['legacy-admin', 'legacy-agent', 'staff'].map((profile, i) => ({
      profile,
      claimId: 'claim-' + i,
      staffId: 'staff-' + i,
      targetMode: 'value',
    })),
  };
  const form = new FormData();
  for (const [k, v] of Object.entries({
    claimId: 'claim-0',
    staffId: 'staff-0',
    targetMode: 'value',
    operationId: id,
  }))
    form.set(k, v);
  assert.deepEqual(matchQualificationInput(form, 'legacy-admin', plan), {
    claimId: 'claim-0',
    staffId: 'staff-0',
    operationId: id,
  });
  assert.equal(matchQualificationInput(form, 'legacy-agent', plan), null);
  form.set('claimId', 'foreign');
  assert.equal(matchQualificationInput(form, 'legacy-admin', plan), null);
  form.set('claimId', 'claim-0');
  form.set('staffId', 'foreign');
  assert.equal(matchQualificationInput(form, 'legacy-admin', plan), null);
  form.set('staffId', 'staff-0');
  form.append('operationId', id);
  assert.equal(matchQualificationInput(form, 'legacy-admin', plan), null);
});
test('canonical browser output is owned 0700 and tracing stays disabled', async () => {
  const { assertOwnedBrowserOutput } =
    await import('./m4-compiled-fixture/project/browser-output.mjs');
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-browser-output-'))),
    output = path.join(parent, 'out');
  try {
    fs.mkdirSync(output, { mode: 0o700 });
    assert.equal(assertOwnedBrowserOutput(output), output);
    fs.chmodSync(output, 0o755);
    assert.throws(() => assertOwnedBrowserOutput(output));
    const config = fs.readFileSync(
      path.join(root, 'scripts/ci/m4-compiled-fixture/project/playwright.config.mjs'),
      'utf8'
    );
    assert.match(config, /trace:\s*['"]off['"]/u);
    assert.match(config, /ignoreHTTPSErrors:\s*false/u);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('installed package identity is stable under source-root relocation and rejects escapes', async () => {
  const { installedPackageId } = await import('./m4-compiled-fixture/package-graph.mjs');
  const suffix = '/.pnpm/example@1.2.3/node_modules/example';
  assert.equal(
    installedPackageId('/tmp/tree-a/node_modules', '/tmp/tree-a/node_modules' + suffix),
    installedPackageId('/tmp/tree-b/node_modules', '/tmp/tree-b/node_modules' + suffix)
  );
  assert.throws(() => installedPackageId('/tmp/tree-a/node_modules', '/tmp/tree-a/foreign'));
  assert.throws(() => installedPackageId('/tmp/tree-a/node_modules', '/tmp/tree-a'));
  assert.equal(
    installedPackageId('/tmp/tree-a/node_modules', '/tmp/tree-a/node_modules/...'),
    installedPackageId('/tmp/tree-b/node_modules', '/tmp/tree-b/node_modules/...')
  );
  assert.throws(() => installedPackageId('/tmp/tree-a/node_modules', '/tmp/tree-a/node_modules'));
});

// Rehash the mutated action in an isolated fixed-contract copy. This exercises
// the semantic law after the ordinary descriptor gate has accepted the bytes.
async function deriveWithRehashedAction(transform) {
  const dir = fixture();
  try {
    for (const file of [
      'db-access-m4-compiled-source.mjs',
      'db-access-provider-runtime-identity.mjs',
      'db-access-git-blob-batch.mjs',
    ]) {
      fs.copyFileSync(path.join(root, 'scripts/ci', file), path.join(dir, 'scripts/ci', file));
    }
    fs.symlinkSync(
      fs.realpathSync(path.join(root, 'node_modules')),
      path.join(dir, 'node_modules'),
      'dir'
    );
    const action = 'scripts/ci/m4-compiled-fixture/project/app/actions.js';
    const file = path.join(dir, action);
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    assert.notEqual(after, before);
    fs.writeFileSync(file, after);
    const contract = structuredClone(fixed);
    contract.projectFiles[action].bytes = Buffer.byteLength(after);
    contract.projectFiles[action].sha256 = createHash('sha256').update(after).digest('hex');
    fs.writeFileSync(
      path.join(dir, 'scripts/ci/db-access-m4-compiled-contract.json'),
      JSON.stringify(contract)
    );
    const module = await import(
      pathToFileURL(path.join(dir, 'scripts/ci/db-access-m4-compiled-source.mjs')).href
    );
    return module.deriveM4CompiledFixtureSource({ producerRoot: dir, candidateRoot: dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
test('closed action AST accepts comments and formatting after descriptors are refreshed', async () => {
  const observation = await deriveWithRehashedAction(
    s => '// harmless comment\n' + s.replaceAll("'", '"')
  );
  assert.equal(observation.actions.length, 3);
});
for (const [label, mutate] of [
  ['extra top-level effect', s => s + '\nconsole.log("effect");\n'],
  [
    'different import binding',
    s =>
      s.replace(
        "import { headers } from 'next/headers';",
        "import { fake as headers } from 'next/headers';"
      ),
  ],
  [
    'extra body effect hidden beside expected calls',
    s =>
      s.replace(
        'const requestHeaders = await headers();',
        'console.log("side effect"); const requestHeaders = await headers();'
      ),
  ],
  [
    'guard bypass with expected text in comment',
    s =>
      s.replace(
        'if (!input) return invalid();',
        '// if (!input) return invalid();\n  if (false) return invalid();'
      ),
  ],
  [
    'altered action parameter',
    s => s.replace('runAdminAssignment(_previous, form)', 'runAdminAssignment(form, _previous)'),
  ],
  ['altered result', s => s.replace('return uncertain(input);', 'return invalid();')],
  [
    'extra catch effect',
    s => s.replace('return uncertain(input);', 'console.log("effect"); return uncertain(input);'),
  ],
]) {
  test('rehashed action refuses ' + label, async () => {
    await assert.rejects(deriveWithRehashedAction(mutate), /closed server-action program/);
  });
}
