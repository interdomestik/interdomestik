import {
  accessSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';

import { runCommand } from './verify-machine-exec.mjs';
import { MARKER_PATH, sha256Hex, validateMarker } from './verify-machine-marker.mjs';

const WRITABLE_BY_OTHERS = 0o022;
// macOS ACL entries, one per line after the listing line of `ls -lde`.
const ACL_ENTRY = /^\s*\d+: /u;

function listAclEntries(target) {
  return runCommand('/bin/ls', ['-lde', target])
    .split('\n')
    .slice(1)
    .filter(line => ACL_ENTRY.test(line));
}

const DEFAULT_FS = Object.freeze({
  accessSync,
  aclEntries: listAclEntries,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
});

function writableByThisProcess(fs, target) {
  try {
    fs.accessSync(target, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * An ACL can grant rights that write access does not show, such as changing the protections
 * (`writesecurity`) or deleting a child. Deny entries only take rights away, so only allows fail.
 */
function aclErrors(fs, label, target) {
  let entries;
  try {
    entries = fs.aclEntries(target);
  } catch {
    return [`${label} ACL cannot be read`];
  }
  return entries.some(entry => /\ballow\b/u.test(entry))
    ? [`${label} has an ACL entry that grants access`]
    : [];
}

/** Mode bits, owner, type, effective write access and ACL grants. */
function protectionErrors(fs, label, target, stat, expectFile) {
  const errors = [];
  if (expectFile ? !stat.isFile() : !stat.isDirectory()) {
    errors.push(`${label} must be a ${expectFile ? 'regular file' : 'directory'}, not a link`);
  }
  if (stat.uid !== 0) errors.push(`${label} must be owned by root`);
  if ((stat.mode & WRITABLE_BY_OTHERS) !== 0) {
    errors.push(`${label} must not be writable by group or others`);
  }
  if (writableByThisProcess(fs, target)) errors.push(`${label} is writable by this user`);
  errors.push(...aclErrors(fs, label, target));
  return errors;
}

function ancestors(markerPath) {
  const chain = [];
  for (let dir = path.dirname(markerPath); ; dir = path.dirname(dir)) {
    chain.push(dir);
    if (dir === path.dirname(dir)) return chain;
  }
}

function readPinned(fs, markerPath, linkStat) {
  const descriptor = fs.openSync(markerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(descriptor);
    if (opened.dev !== linkStat.dev || opened.ino !== linkStat.ino) return null;
    return { bytes: fs.readFileSync(descriptor), opened };
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * Reads the marker only when root owns it and every directory above it, none of them is
 * writable by group, others or this user or carries an ACL grant, and the opened file is the
 * one that was checked.
 */
export function readTrustedMarker(markerPath = MARKER_PATH, fs = DEFAULT_FS) {
  let linkStat;
  try {
    linkStat = fs.lstatSync(markerPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'absent' };
    return { status: 'invalid', errors: [`marker cannot be read (${error?.code ?? 'error'})`] };
  }
  const errors = protectionErrors(fs, 'marker file', markerPath, linkStat, true);
  if (linkStat.nlink !== 1) errors.push('marker file must have exactly one link');
  for (const dir of ancestors(markerPath)) {
    let dirStat;
    try {
      dirStat = fs.lstatSync(dir);
    } catch (error) {
      errors.push(`directory ${dir} cannot be read (${error?.code ?? 'error'})`);
      continue;
    }
    errors.push(...protectionErrors(fs, `directory ${dir}`, dir, dirStat, false));
  }
  if (errors.length > 0) return { status: 'invalid', errors };
  let pinned;
  try {
    pinned = readPinned(fs, markerPath, linkStat);
  } catch (error) {
    return { status: 'invalid', errors: [`marker cannot be opened (${error?.code ?? 'error'})`] };
  }
  if (!pinned) return { status: 'invalid', errors: ['marker changed while it was checked'] };
  let marker;
  try {
    marker = JSON.parse(pinned.bytes.toString('utf8'));
  } catch {
    return { status: 'invalid', errors: ['marker is not valid JSON'] };
  }
  const shapeProblems = validateMarker(marker);
  if (shapeProblems.length > 0) return { status: 'invalid', errors: shapeProblems };
  return { status: 'trusted', marker, sha256: sha256Hex(pinned.bytes) };
}
