import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { hash, refuse } from './db-access-provider-runtime-identity.mjs';
import { label } from './db-access-crm-runtime-graph.mjs';

const fail = reason => refuse('crm package archive: ' + reason);

const MAX_BYTES = 150_000_000;
const MAX_MEMBERS = 200_000;
const PLAIN_MEMBER = /^[d-]/u;
const LINKED_MEMBER = /( -> | link to )/u;

// Archives are pre-downloaded immutable inputs: no network, no package manager, no install hooks.
export const archiveFile = (archives, record) =>
  path.join(archives, hash(record.integrity) + '.tgz');

export function readArchive(archives, record) {
  const file = archiveFile(archives, record);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    fail('missing archive ' + label(record));
  }
  if (!stat.isFile() || fs.realpathSync(file) !== file) fail('archive file ' + label(record));
  if (!stat.size || stat.size > MAX_BYTES) fail('archive size ' + label(record));
  const bytes = fs.readFileSync(file);
  if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== record.integrity)
    fail('archive integrity ' + label(record));
  return { file, sha256: hash(bytes), bytes: bytes.length };
}

export function archiveMembers(file, record, run) {
  const names = run('/usr/bin/tar', ['-tzf', file]).split('\n').filter(Boolean);
  const kinds = run('/usr/bin/tar', ['-tvzf', file]).split('\n').filter(Boolean);
  if (!names.length || names.length > MAX_MEMBERS || names.length !== kinds.length)
    fail('archive listing ' + label(record));
  const prefix = names[0].split('/')[0];
  const packageName = record.name.split('/').at(-1);
  const typesPrefix = record.name.startsWith('@types/')
    ? packageName + ' v' + record.version.split('.').slice(0, 2).join('.')
    : null;
  if (!['package', packageName, typesPrefix].includes(prefix))
    fail('archive prefix ' + label(record));
  for (const name of names)
    if (
      !(name === prefix || name.startsWith(prefix + '/')) ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').includes('..')
    )
      fail('archive member path ' + label(record) + ' ' + name.slice(0, 120));
  if (kinds.some(line => !PLAIN_MEMBER.test(line) || LINKED_MEMBER.test(line)))
    fail('archive member type ' + label(record));
  return names.length;
}

function assertPlainTree(directory, record) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || !(entry.isFile() || entry.isDirectory()))
      fail('extracted entry ' + label(record) + ' ' + entry.name);
    if (entry.isDirectory()) assertPlainTree(full, record);
  }
}

export function installArchive({ archives, record, directory, run }) {
  const archive = readArchive(archives, record);
  const members = archiveMembers(archive.file, record, run);
  run('/usr/bin/tar', [
    '-xzf',
    archive.file,
    '-C',
    directory,
    '--strip-components=1',
    '--no-same-owner',
    '--no-same-permissions',
  ]);
  assertPlainTree(directory, record);
  const manifest = path.join(directory, 'package.json');
  if (!fs.existsSync(manifest) || !fs.lstatSync(manifest).isFile())
    fail('missing manifest ' + label(record));
  const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (parsed.name !== record.name || parsed.version?.replace(/^v/u, '') !== record.version)
    fail('package manifest ' + label(record));
  return { sha256: archive.sha256, bytes: archive.bytes, members };
}
