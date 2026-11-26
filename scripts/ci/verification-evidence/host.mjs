import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTrustedBytes } from '../verify-machine-trust.mjs';
import { readBytes } from './bytes.mjs';
import { MANIFEST_SHA256 } from './manifest.mjs';
import { assertEvidence, isSha256 } from './ticket.mjs';

const SUPPORT = '/Library/Application Support/Interdomestik';
const NAMESPACE = 'interdomestik-gate-v1';
// Darwin's ACL_EXTENDED_ALLOW and ACL_EXTENDED_DENY tags from sys/acl.h.
const ACL_ALLOW = 1;
const ACL_DENY = 2;
// ls can omit the ACL when its read fails. Use the native API on the opened directory.
const READ_MAC_ACL = `
require 'fiddle/import'
require 'json'

module ACL
  extend Fiddle::Importer
  dlload '/usr/lib/libSystem.B.dylib'
  extern 'void *acl_get_fd(int)'
  extern 'int acl_get_entry(void *, int, void *)'
  extern 'int acl_get_tag_type(void *, void *)'
  extern 'int acl_free(void *)'
end

tags = []
acl = ACL.acl_get_fd(3)
if acl.null?
  # ENOENT on an open descriptor means it has no ACL.
  abort unless Fiddle.last_error == Errno::ENOENT::Errno
else
  entry = [0].pack('J')
  tag = [0].pack('I!')
  position = 0 # ACL_FIRST_ENTRY
  while ACL.acl_get_entry(acl, position, entry) == 0
    abort unless ACL.acl_get_tag_type(entry.unpack1('J'), tag) == 0
    tags << tag.unpack1('I!')
    position = -1 # ACL_NEXT_ENTRY
  end
  # Darwin uses EINVAL to signal the end of this iterator.
  abort unless Fiddle.last_error == Errno::EINVAL::Errno
  ACL.acl_free(acl)
end
puts JSON.generate(tags)
`;
const APPROVAL_FIELDS = [
  'rulesSha256',
  'm4MarkerSha256',
  'm5MarkerSha256',
  'm5RunnerSha256',
  'manifestSha256',
  'allowedSignersSha256',
  'm4ResolverSha256',
  'm4LauncherSha256',
  'm5WorkerSha256',
  'm5WorkerPathsSha256',
];

export const cleanHostEnv = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  LANG: 'C',
  NODE_V8_COVERAGE: undefined,
});

export function protectedFile(name, digest) {
  const file = path.join(SUPPORT, name);
  const result = readTrustedBytes(file);
  assertEvidence(
    result.status === 'trusted' && (!digest || result.sha256 === digest),
    'host-trust'
  );
  return { ...result, file };
}

export function readApproval() {
  const { bytes, sha256 } = protectedFile('gate-evidence-approval.json');
  const config = JSON.parse(bytes);
  assertEvidence(
    config?.schema === 'interdomestik.gate-evidence-approval/1' &&
      config.approved === true &&
      ['trial', 'gate'].includes(config.mode) &&
      APPROVAL_FIELDS.every(field => isSha256(config[field])) &&
      config.manifestSha256 === MANIFEST_SHA256 &&
      config.m4MarkerSha256 !== config.m5MarkerSha256,
    'owner-approval'
  );
  return { ...config, sha256 };
}

function checkOwnedDirectory(directory, forbiddenMode, code) {
  const stat = lstatSync(directory);
  assertEvidence(
    stat.isDirectory() &&
      stat.uid === process.getuid() &&
      (stat.mode & forbiddenMode) === 0 &&
      path.resolve(directory) === directory,
    code
  );
}

export function checkJobDirectory(directory) {
  checkOwnedDirectory(directory, 0o077, 'job-directory');
}

function readMacDirectoryAcl(directory) {
  assertEvidence(process.platform === 'darwin', 'signature-acl-platform');
  const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    return hostCommand('/usr/bin/ruby', ['--disable=gems', '-e', READ_MAC_ACL], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe', fd],
    });
  } finally {
    closeSync(fd);
  }
}

function checkSignatureDirectory(directory, forbiddenMode, code, readAcl) {
  checkOwnedDirectory(directory, forbiddenMode, code);
  const unreadable = `${code}-acl-unreadable`;
  let tags;
  try {
    tags = JSON.parse(readAcl(directory));
  } catch {
    throw new Error(unreadable);
  }
  assertEvidence(
    Array.isArray(tags) && tags.every(tag => tag === ACL_ALLOW || tag === ACL_DENY),
    unreadable
  );
  assertEvidence(!tags.includes(ACL_ALLOW), `${code}-acl-grant`);
}

export function createSignatureDirectory(home, readAcl = readMacDirectoryAcl) {
  checkSignatureDirectory(home, 0o022, 'signature-home', readAcl);
  const base = path.join(home, '.interdomestik-gate-signatures');
  mkdirSync(base, { recursive: true, mode: 0o700 });
  checkSignatureDirectory(base, 0o077, 'signature-directory', readAcl);
  return mkdtempSync(path.join(base, 'signature-'));
}

export function hostCommand(file, args, options = {}) {
  return execFileSync(file, args, {
    env: cleanHostEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    ...options,
  });
}

export function sign(payload, role) {
  // ssh-keygen reads the host key directly under the authority account.
  const key = path.join(os.userInfo().homedir, '.ssh', `interdomestik-gate-${role}`);
  return hostCommand('/usr/bin/ssh-keygen', ['-Y', 'sign', '-f', key, '-n', NAMESPACE], {
    input: payload,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function authenticate(payload, signature, role, approved) {
  const signerFile = protectedFile('gate-evidence-allowed-signers', approved.allowedSignersSha256);
  const temp = createSignatureDirectory(os.userInfo().homedir);
  const file = path.join(temp, 'signature');
  try {
    writeFileSync(file, signature, { flag: 'wx', mode: 0o600 });
    hostCommand(
      '/usr/bin/ssh-keygen',
      [
        '-Y',
        'verify',
        '-f',
        signerFile.file,
        '-I',
        `interdomestik-gate-${role}`,
        '-n',
        NAMESPACE,
        '-s',
        file,
      ],
      { input: payload, stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch {
    throw new Error('authentication');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function signedDocument(directory, name, role, approved, verify = authenticate) {
  const bytes = readBytes(path.join(directory, `${name}.json`), 1024 * 1024);
  const signature = readBytes(path.join(directory, `${name}.sig`), 16 * 1024);
  verify(bytes, signature, role, approved);
  return { value: JSON.parse(bytes), bytes, signature };
}

export function writeArtifact(directory, name, bytes) {
  writeFileSync(path.join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
}
