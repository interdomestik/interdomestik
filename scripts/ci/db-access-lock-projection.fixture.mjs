// Shared input and helpers for the G0 lockfile projection tests.
import assert from 'node:assert/strict';
import path from 'node:path';
import { lockImporters, lockProjection } from './db-access-lock-projection.mjs';

// A fixed input in the real lockfile's shape: mutation cases must not depend on the checkout,
// whose lockfile may already hold the link a case adds.
export const lock = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

overrides:
  next: 16.4.5

patchedDependencies:
  next@16.4.5:
    hash: 0123abcd
    path: patches/next@16.4.5.patch

importers:

  .:
    devDependencies:
      '@commitlint/cli':
        specifier: ^20.5.3
        version: 20.5.3

  apps/web:
    dependencies:
      '@interdomestik/database':
        specifier: workspace:*
        version: link:../../packages/database
      next:
        specifier: 16.4.5
        version: 16.4.5(patch_hash=0123abcd)

  packages/database:
    dependencies:
      drizzle-orm:
        specifier: ^0.45.2
        version: 0.45.2(pg@8.23.0)

  packages/domain-activities:
    dependencies:
      '@interdomestik/database':
        specifier: workspace:*
        version: link:../database
      zod:
        specifier: ^4.0.0
        version: 4.0.0

  packages/domain-claims:
    dependencies:
      '@interdomestik/database':
        specifier: workspace:*
        version: link:../database

  packages/domain-communications:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/domain-privacy:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/shared-auth:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/shared-utils:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

packages:

  '@commitlint/cli@20.5.3':
    resolution: {integrity: sha512-a}

snapshots:

  '@commitlint/cli@20.5.3': {}
`;
export const digest = text => lockProjection(Buffer.from(text, 'utf8')).sha256;
export const base = digest(lock);
export const refused = { message: /^incomplete: lockfile projection /u };

// Insert lines directly after `header` inside `importer`; the header line must exist once there.
export function insertAfter(text, importer, header, lines) {
  const start = text.indexOf(`\n  ${importer}:\n`);
  assert.ok(start >= 0, importer);
  // Importers are separated by one blank line; the section ends at the next one.
  const section = text.slice(start, text.indexOf('\n\n', start + 1) + 1);
  const at = section.indexOf(`\n${header}\n`);
  assert.ok(at >= 0, `${importer} ${header}`);
  const cut = start + at + header.length + 2;
  return text.slice(0, cut) + lines.map(line => `${line}\n`).join('') + text.slice(cut);
}
export const link = (name, target, specifier = 'workspace:*') => [
  `      '@interdomestik/${name}':`,
  `        specifier: ${specifier}`,
  `        version: ${target}`,
];
export const addLink = (text, importer, block, name, target) =>
  insertAfter(text, importer, `    ${block}:`, link(name, target));
export const replaceOnce = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `exactly one ${from}`);
  return text.replace(from, to);
};
export const COMMITLINT = "      '@commitlint/cli':\n        specifier: ^20.5.3\n";

// A packages/* importer with a dependencies block and a package it does not link yet.
export function unlinkedPair(text) {
  const importers = lockImporters(Buffer.from(text, 'utf8'));
  const targets = [...importers.keys()].filter(name => name.startsWith('packages/'));
  for (const [name, blocks] of importers) {
    if (!name.startsWith('packages/') || !blocks.has('dependencies')) continue;
    const linked = new Set([...blocks.values()].flatMap(entries => [...entries.keys()]));
    const target = targets.find(
      other => other !== name && !linked.has(`@interdomestik/${path.posix.basename(other)}`)
    );
    if (target) return { importer: name, target: path.posix.basename(target) };
  }
  return assert.fail('no importer can take a new first-party link');
}
