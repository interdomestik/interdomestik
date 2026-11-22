import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ADOPTION } from './db-access-adoption.mjs';
import { LOCK_PROJECTION_ID, lockImporters } from './db-access-lock-projection.mjs';
import {
  RESOLVER_SNAPSHOT,
  verifyCurrentResolverSnapshot,
} from './db-access-resolver-snapshot.mjs';
import { authenticateSnapshot, resolverFile, verifyResolverBoundary } from './db-access-trust.mjs';
import { runGit } from './db-access-git.mjs';
import {
  createTempRepo,
  rootDir,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const predecessor = '18cd1a73b12f589c69934cba862092d857434013';
// Main before the WP-05 devDependencies: same workspace, lockfile accepted by the previous snapshot.
const formerMain = 'c266f094b5249903f75e5c4e1b29e52959d30370';
// Main before the next 16.4.5 upgrade: same-size pair accepted by the previous snapshot.
const beforeNextUpgrade = 'c775e2db6c3fc083cdd605c7d2047ab25dcc9562';
const pair = Object.keys(RESOLVER_SNAPSHOT.files);
const current = new Map(pair.map(file => [file, fs.readFileSync(path.join(rootDir, file))]));
const previous = new Map(
  pair.map(file => [file, runGit(['-C', rootDir, 'show', `${ADOPTION.commit}:${file}`])])
);
const formerlyAccepted = new Map(
  pair.map(file => [file, runGit(['-C', rootDir, 'show', `${predecessor}:${file}`])])
);
function fixture(t, contents = current) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, bytes] of contents) fs.writeFileSync(path.join(root, file), bytes);
  return root;
}

test('production snapshot admits exactly the new pair without replacing historical adoption', t => {
  const root = fixture(t);
  const accepted = verifyCurrentResolverSnapshot(root, ADOPTION);
  assert.deepEqual([...accepted.keys()], pair);
  assert.equal(accepted.get(pair[0]), current.get(pair[0]).toString());
  assert.equal(ADOPTION.commit, '278e33ab0dd448547fa81d4b0ff122b4d69c901e');
  assert.equal(
    ADOPTION.files['scripts/ci/db-access-baseline.json'],
    RESOLVER_SNAPSHOT.baselineSha256
  );
  assert.equal(ADOPTION.critical.length, 4);
  assert.ok(Object.isFrozen(RESOLVER_SNAPSHOT.files[pair[0]]));
  assert.equal(resolverFile('pnpm-lock.yaml'), false, 'fixture resolver semantics stay unchanged');
  assert.equal(RESOLVER_SNAPSHOT.files['pnpm-lock.yaml'].projection, LOCK_PROJECTION_ID);
  assert.equal(RESOLVER_SNAPSHOT.files['pnpm-workspace.yaml'].projection, undefined);
});

// A link the live lockfile does not hold yet: a packages/* importer with a dependencies block
// (wherever it sits among the importer's blocks), a package it does not link, another package for
// the wrong-target case, a block name the importer lacks (or null) and the number of free targets.
function linkSite(lock) {
  const importers = lockImporters(Buffer.from(lock, 'utf8'));
  const names = [...importers.keys()].filter(name => name.startsWith('packages/'));
  for (const [name, blocks] of importers) {
    if (!name.startsWith('packages/') || !blocks.has('dependencies')) continue;
    const linked = new Set([...blocks.values()].flatMap(entries => [...entries.keys()]));
    const free = names.filter(
      other => other !== name && !linked.has(`@interdomestik/${path.posix.basename(other)}`)
    );
    const wrong = names.find(other => other !== name && other !== free[0]);
    if (free.length === 0 || !wrong) continue;
    const heading = `\n  ${name}:\n`;
    assert.equal(lock.split(heading).length, 2, heading);
    const importerAt = lock.indexOf(heading) + heading.length;
    // The importer's section ends at the next importer or top-level header, as in the parser;
    // a blank line does not end it.
    const rest = /^ {0,2}[^ \n]/mu.exec(lock.slice(importerAt));
    const section = lock.slice(importerAt - 1, rest ? importerAt + rest.index : lock.length);
    const block = '\n    dependencies:\n';
    assert.equal(section.split(block).length, 2, `${name} ${block}`);
    const blockAt = importerAt - 1 + section.indexOf(block) + block.length;
    return {
      name,
      freeCount: free.length,
      spare: ['optionalDependencies', 'devDependencies'].find(other => !blocks.has(other)) ?? null,
      importerAt,
      blockAt,
      target: path.posix.basename(free[0]),
      wrong: path.posix.basename(wrong),
    };
  }
  return assert.fail('no importer can take a new first-party link');
}
const insertAt = (text, at, lines) => text.slice(0, at) + lines + text.slice(at);
const entry = (target, version, specifier = 'workspace:*') =>
  `      '@interdomestik/${target}':\n        specifier: ${specifier}\n        version: ${version}\n`;

test('a first-party workspace link passes the lockfile pin; its malformed form does not', t => {
  const lock = current.get('pnpm-lock.yaml').toString('utf8');
  const { name, freeCount, spare, importerAt, blockAt, target, wrong } = linkSite(lock);
  const withLink = (version, specifier) =>
    insertAt(lock, blockAt, entry(target, version, specifier));
  const verified = contents => {
    const root = fixture(t, new Map([...current, ['pnpm-lock.yaml', Buffer.from(contents)]]));
    return verifyCurrentResolverSnapshot(root, ADOPTION).get('pnpm-lock.yaml');
  };
  const linked = withLink(`link:../${target}`);
  assert.notEqual(linked, lock);
  assert.equal(verified(linked), linked, 'the verified bytes are the checkout bytes');
  // A new block ahead of the importer's existing blocks: it disappears from the projection, and the
  // next link is still found inside that importer, now behind the new block.
  if (spare !== null && freeCount > 1) {
    const first = entry(target, `link:../${target}`);
    const ahead = insertAt(lock, importerAt, `    ${spare}:\n${first}`);
    assert.equal(verified(ahead), ahead, 'a new first block');
    const again = linkSite(ahead);
    assert.equal(again.name, name, 'the same importer, its dependencies block now second');
    assert.ok(again.blockAt > again.importerAt + spare.length, 'found behind the new block');
    const both = insertAt(ahead, again.blockAt, entry(again.target, `link:../${again.target}`));
    assert.equal(verified(both), both, 'a link after a preceding block');
    const parsed = lockImporters(Buffer.from(both, 'utf8')).get(name);
    assert.ok(parsed.get('dependencies').has(`@interdomestik/${again.target}`), 'in dependencies');
  }
  const external = lock.replace("lockfileVersion: '9.0'\n", "lockfileVersion: '9.1'\n");
  assert.notEqual(external, lock);
  for (const [contents, message] of [
    [withLink(`link:../${wrong}`), 'unparseable'],
    [withLink('1.0.0', '^1.0.0'), 'unparseable'],
    [`${lock}\n`, 'unparseable'],
    [external, 'digest mismatch'],
  ]) {
    const bad = fixture(t, new Map([...current, ['pnpm-lock.yaml', Buffer.from(contents)]]));
    assert.throws(() => verifyCurrentResolverSnapshot(bad, ADOPTION), {
      message: `incomplete: resolver snapshot ${message} pnpm-lock.yaml`,
    });
  }
});

test('the lockfile keeps a size bound before it is read', t => {
  const bound = RESOLVER_SNAPSHOT.files['pnpm-lock.yaml'].maxBytes;
  assert.equal(bound, 8 * 1024 * 1024);
  const root = fixture(t, new Map([...current, ['pnpm-lock.yaml', Buffer.alloc(bound + 1, 0x20)]]));
  assert.throws(() => verifyCurrentResolverSnapshot(root, ADOPTION), {
    message: 'incomplete: resolver snapshot size bound exceeded pnpm-lock.yaml',
  });
});

test('old pair, mixed pair and same-size metadata tampering are rejected', t => {
  for (const contents of [
    previous,
    new Map([
      [pair[0], current.get(pair[0])],
      [pair[1], previous.get(pair[1])],
    ]),
  ]) {
    const root = fixture(t, contents);
    assert.throws(
      () => verifyCurrentResolverSnapshot(root, ADOPTION),
      /resolver snapshot .*mismatch/u
    );
  }
  for (const file of pair) {
    const root = fixture(t);
    const bytes = Buffer.from(current.get(file));
    bytes[bytes.length - 2] ^= 1;
    fs.writeFileSync(path.join(root, file), bytes);
    assert.throws(
      () => verifyCurrentResolverSnapshot(root, ADOPTION),
      /resolver snapshot digest mismatch/u
    );
  }
});

test('the former accepted pair and both mixed successor states are rejected', t => {
  for (const contents of [
    formerlyAccepted,
    new Map([
      [pair[0], current.get(pair[0])],
      [pair[1], formerlyAccepted.get(pair[1])],
    ]),
    new Map([
      [pair[0], formerlyAccepted.get(pair[0])],
      [pair[1], current.get(pair[1])],
    ]),
  ]) {
    const root = fixture(t, contents);
    assert.throws(
      () => verifyCurrentResolverSnapshot(root, ADOPTION),
      /resolver snapshot .*mismatch/u
    );
  }
});

test('the immediately former lockfile with the unchanged workspace is rejected', t => {
  const formerLock = runGit(['-C', rootDir, 'show', `${formerMain}:pnpm-lock.yaml`]);
  assert.equal(formerLock.length, 713603);
  assert.equal(
    createHash('sha256').update(formerLock).digest('hex'),
    '881de32f136d92f26594ece017bd8d2f8e1d965874310906332e4627ad66929b'
  );
  assert.notDeepEqual(formerLock, current.get('pnpm-lock.yaml'));
  const root = fixture(
    t,
    new Map([
      ['pnpm-workspace.yaml', current.get('pnpm-workspace.yaml')],
      ['pnpm-lock.yaml', formerLock],
    ])
  );
  // The projection pin compares the canonical projection, not the raw size.
  assert.throws(() => verifyCurrentResolverSnapshot(root, ADOPTION), {
    message: 'incomplete: resolver snapshot digest mismatch pnpm-lock.yaml',
  });
});

test('the pair before the next 16.4.5 upgrade and both mixed states are rejected by digest', t => {
  const before = new Map(
    pair.map(file => [file, runGit(['-C', rootDir, 'show', `${beforeNextUpgrade}:${file}`])])
  );
  const expected = {
    'pnpm-workspace.yaml': [
      'cdf45a0f415af8a44caab57f1ec9c0e9cd3d2526c1387dab334b9f243c4b58b8',
      2105,
    ],
    'pnpm-lock.yaml': ['1179aca6d60550aa7b1ab89440f25deb942f6b197afb933c106fcfa4a017dc2d', 713785],
  };
  for (const file of pair) {
    const bytes = before.get(file);
    assert.equal(bytes.length, expected[file][1], `${file} keeps its size`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected[file][0]);
    assert.notDeepEqual(bytes, current.get(file));
  }
  for (const [contents, rejected] of [
    [before, 'pnpm-workspace.yaml'],
    [
      new Map([
        ['pnpm-workspace.yaml', current.get('pnpm-workspace.yaml')],
        ['pnpm-lock.yaml', before.get('pnpm-lock.yaml')],
      ]),
      'pnpm-lock.yaml',
    ],
    [
      new Map([
        ['pnpm-workspace.yaml', before.get('pnpm-workspace.yaml')],
        ['pnpm-lock.yaml', current.get('pnpm-lock.yaml')],
      ]),
      'pnpm-workspace.yaml',
    ],
  ]) {
    const root = fixture(t, contents);
    assert.throws(() => verifyCurrentResolverSnapshot(root, ADOPTION), {
      message: `incomplete: resolver snapshot digest mismatch ${rejected}`,
    });
  }
});

test('missing, symlinked, non-file and case-ambiguous metadata fail closed', t => {
  for (const file of pair) {
    for (const mode of ['missing', 'symlink', 'directory', 'alias']) {
      const root = fixture(t);
      const full = path.join(root, file);
      fs.rmSync(full);
      if (mode === 'symlink') fs.symlinkSync(path.join(rootDir, file), full);
      if (mode === 'directory') fs.mkdirSync(full);
      if (mode === 'alias')
        fs.writeFileSync(path.join(root, file.toUpperCase()), current.get(file));
      assert.throws(
        () => verifyCurrentResolverSnapshot(root, ADOPTION),
        /resolver snapshot (missing or ambiguous|non-regular)/u
      );
    }
  }
});

test('snapshot cannot authenticate another adoption, tree or baseline', t => {
  const root = fixture(t);
  for (const change of [
    { commit: '0'.repeat(40) },
    { tree: '0'.repeat(40) },
    { files: { ...ADOPTION.files, 'scripts/ci/db-access-baseline.json': '0'.repeat(64) } },
  ])
    assert.throws(
      () => verifyCurrentResolverSnapshot(root, { ...ADOPTION, ...change }),
      /adoption mismatch/u
    );
});

test('snapshot changes only workspace comparison; package, config, hook and extra resolver changes still reject', () => {
  const root = createTempRepo();
  for (const [file, bytes] of previous) writeFixture(root, file, bytes);
  sealFixture(root);
  const epoch = JSON.parse(fs.readFileSync(path.join(root, '.fixture-adoption.json'), 'utf8'));
  const trusted = authenticateSnapshot(root, epoch);
  for (const [file, bytes] of current) writeFixture(root, file, bytes);
  const accepted = verifyCurrentResolverSnapshot(root, ADOPTION);
  assert.throws(
    () => verifyResolverBoundary(root, trusted),
    /resolver boundary changed pnpm-workspace/u
  );
  assert.doesNotThrow(() => verifyResolverBoundary(root, trusted, accepted));
  for (const [file, bytes] of [
    ['apps/web/package.json', '{"dependencies":{"evil":"1"}}'],
    ['apps/web/tsconfig.json', '{"compilerOptions":{"paths":{"*": ["evil/*"]}}}'],
    ['.pnpmfile.cjs', 'module.exports={hooks:{readPackage(p){return p}}};'],
    ['packages/evil/package.json', '{"name":"evil"}'],
  ]) {
    const original = fs.existsSync(path.join(root, file))
      ? fs.readFileSync(path.join(root, file))
      : undefined;
    writeFixture(root, file, bytes);
    assert.throws(
      () => verifyResolverBoundary(root, trusted, accepted),
      /resolver boundary changed/u
    );
    if (original) writeFixture(root, file, original);
    else fs.rmSync(path.join(root, file));
  }
});
