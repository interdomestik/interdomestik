// The G0 resolver snapshot with a first-party workspace link: a canonical link passes the
// projected lockfile pin with the checkout bytes; a malformed link or an external change does not.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ADOPTION } from './db-access-adoption.mjs';
import { lockImporters } from './db-access-lock-projection.mjs';
import {
  RESOLVER_SNAPSHOT,
  verifyCurrentResolverSnapshot,
} from './db-access-resolver-snapshot.mjs';
import { rootDir } from './db-access-guard-test-utils.mjs';

const pair = Object.keys(RESOLVER_SNAPSHOT.files);
const current = new Map(pair.map(file => [file, fs.readFileSync(path.join(rootDir, file))]));
function fixture(t, contents = current) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, bytes] of contents) fs.writeFileSync(path.join(root, file), bytes);
  return root;
}

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
