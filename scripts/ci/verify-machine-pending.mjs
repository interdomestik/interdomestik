// Finding a shell's pending records and pruning abandoned ones. Both read files; the only command
// either may start is the shell start-time lookup, with an empty environment.
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

import { runIsolated } from './verify-machine-exec.mjs';

export const PENDING_VERSION = 2;
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
const SCANS = 3;
const DEFAULT_FS = { readdirSync, readFileSync, rmSync, statSync };

/** The start time of a process, or null when it cannot be read. */
export function readShellStart(pid, run = runIsolated) {
  try {
    const start = run('/bin/ps', ['-o', 'lstart=', '-p', String(pid)]).trim();
    return start === '' ? null : start;
  } catch {
    return null;
  }
}

const isPendingOf = lane => name => name.startsWith(`pending-${lane}-`) && name.endsWith('.json');

// A record belongs to this shell when the PIDs are equal and the start times are equal or either
// is missing. A record from an older verifier (no version 2) counts as this shell's when it names
// no PID or this PID: it can never be published, so treating it as a match only fails closed.
function belongsTo(record, shell) {
  if (record?.version !== PENDING_VERSION) {
    return record?.shellPid === undefined || record.shellPid === shell.pid;
  }
  if (record.shellPid !== shell.pid) return false;
  return !shell.start || !record.shellStart || record.shellStart === shell.start;
}

function scanOnce(directory, lane, shell, fs) {
  let names;
  try {
    names = fs.readdirSync(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const matches = [];
  for (const name of names.filter(isPendingOf(lane))) {
    const filePath = path.join(directory, name);
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null; // finished meanwhile: scan again
      throw error;
    }
    const record = JSON.parse(text);
    if (belongsTo(record, shell)) matches.push({ path: filePath, record });
  }
  return matches;
}

/**
 * The pending records of this shell and lane. Any read or parse error throws: the caller cannot
 * tell whether this shell began a run, so it fails.
 */
export function shellPendingRecords(directory, lane, shell, fs = DEFAULT_FS) {
  for (let scan = 0; scan < SCANS; scan += 1) {
    const matches = scanOnce(directory, lane, shell, fs);
    if (matches) return matches;
  }
  throw Object.assign(new Error('pending records kept changing'), { code: 'EAGAIN' });
}

/**
 * Whether the shell that began a pending run has ended: its PID is gone, or alive with another
 * start time. A live shell, a PID owned by another user, or an unknown start time keeps it.
 */
export function shellEnded(record, { kill = process.kill, startOf = readShellStart } = {}) {
  if (record?.version !== PENDING_VERSION && record?.shellPid === undefined) return true;
  if (!Number.isInteger(record?.shellPid) || record.shellPid <= 0) return false;
  try {
    kill(record.shellPid, 0);
  } catch (error) {
    return error?.code === 'ESRCH';
  }
  const start = startOf(record.shellPid);
  return Boolean(start && record.shellStart && start !== record.shellStart);
}

/** Removes pending records a day old or more whose shell has ended; best effort. */
export function pruneStalePending(directory, nowMs, { fs = DEFAULT_FS, ended = shellEnded } = {}) {
  let names;
  try {
    names = fs.readdirSync(directory);
  } catch {
    return;
  }
  for (const name of names.filter(entry => /^pending-.+\.json$/u.test(entry))) {
    const filePath = path.join(directory, name);
    try {
      if (nowMs - fs.statSync(filePath).mtimeMs < STALE_PENDING_MS) continue;
      const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (ended(record)) fs.rmSync(filePath, { force: true });
    } catch {
      // Another run may have removed it, or it cannot be read; pruning is best effort.
    }
  }
}
