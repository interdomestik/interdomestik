import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

const marker = 'INTERDOMESTIK_CONTRACT_TMPDIR';
// Short on purpose: tools such as tsx create Unix sockets inside TMPDIR, and macOS limits a socket
// path to 103 bytes (its per-user temporary directory alone is about 57).
const prefix = 'idct-';
// A supervisor records its runner's process group here, inside its own scratch, so an enclosing
// supervisor can end a nested group whose supervisor it killed.
const groupFile = '.idct-group';

// One /proc pass over a process group: whether any member is alive, which zombie members it
// saw, and whether a listed entry vanished before its stat could be read.
export function scanGroup(pgid, procRoot = '/proc') {
  let entries;
  try {
    entries = fs.readdirSync(procRoot);
  } catch {
    return null;
  }
  const zombies = [];
  let incomplete = false;
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let stat;
    try {
      stat = fs.readFileSync(path.join(procRoot, entry, 'stat'), 'utf8');
    } catch {
      incomplete = true; // It exited while listed, possibly after forking a member.
      continue;
    }
    // `pid (comm) state ppid pgrp ...`; comm may itself contain spaces and parentheses.
    const [state, , pgrp] = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (Number(pgrp) !== pgid) continue;
    if (state !== 'Z' && state !== 'X') return { live: true };
    zombies.push(entry);
  }
  return { live: false, zombies: zombies.sort().join(','), incomplete };
}

// The same pass from one `ps` snapshot, for hosts without procfs (macOS). A failed `ps` is unknown.
export function scanGroupPs(
  pgid,
  run = () => execFileSync('ps', ['-A', '-o', 'pid=,pgid=,stat='])
) {
  let listing;
  try {
    listing = String(run());
  } catch {
    return { live: false, zombies: '', incomplete: true };
  }
  const zombies = [];
  for (const line of listing.split('\n')) {
    const [pid, pgrp, state = ''] = line.trim().split(/\s+/u);
    if (Number(pgrp) !== pgid) continue;
    if (!state.startsWith('Z')) return { live: true };
    zombies.push(pid);
  }
  return { live: false, zombies: zombies.sort().join(','), incomplete: false };
}

// Whether a process group still has a member that is not a zombie. It reads /proc and, without
// procfs (macOS), `ps` snapshots. A member can fork after one pass lists the processes and then turn
// into a zombie, so "only zombies" holds only for two complete passes that saw the same zombies: a
// zombie cannot fork, so nothing alive was left to start a member the passes missed.
export function groupHasLiveMember(pgid, { procRoot = '/proc', ps, scan } = {}) {
  let pass = scan ?? (id => scanGroup(id, procRoot));
  let first = pass(pgid);
  if (first === null && !scan) {
    pass = id => scanGroupPs(id, ps);
    first = pass(pgid);
  }
  if (first.live) return true;
  const second = pass(pgid);
  if (second.live || first.incomplete || second.incomplete) return true;
  return first.zombies !== second.zombies;
}

export function contractScratch(env) {
  // A contract can invoke the runner itself. Its subprocesses must stay in the outer group.
  if (process.platform === 'win32' || (env[marker] && env[marker] === os.tmpdir())) {
    return {
      detached: false,
      directory: os.tmpdir(),
      stop: (child, signal) => child.kill(signal),
      cleanup() {},
    };
  }

  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  const original = fs.lstatSync(directory);
  Object.assign(env, { TMPDIR: directory, TMP: directory, TEMP: directory, [marker]: directory });

  function signalGroup(pid, signal) {
    if (!pid) return false;
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      // EPERM: members exist (Darwin also answers it for a zombie-only group); the member scan
      // decides whether any of them is alive.
      if (error.code === 'EPERM') return true;
      throw error;
    }
  }

  // Whether the group finished before the deadline. Exited descendants that nobody reaped stay as
  // zombies and still answer a group signal.
  async function waitForGroup(pid, deadline) {
    if (!signalGroup(pid, 0) || !groupHasLiveMember(pid)) return true;
    if (performance.now() >= deadline) return false;
    await setTimeout(50);
    return waitForGroup(pid, deadline);
  }

  // Ends one group: the grace period, then SIGKILL. Returns whether it had to be killed.
  async function endGroup(pid, grace) {
    if (await waitForGroup(pid, performance.now() + grace)) return false;
    signalGroup(pid, 'SIGKILL');
    if (!(await waitForGroup(pid, performance.now() + 2000))) {
      throw new Error('Test subprocesses are still running');
    }
    return true;
  }

  // Groups recorded by nested supervisors anywhere inside this scratch (never through symlinks).
  function nestedGroups(current, found = []) {
    for (const child of fs.readdirSync(current, { withFileTypes: true })) {
      const location = path.join(current, child.name);
      if (child.isDirectory()) nestedGroups(location, found);
      else if (child.isFile() && child.name === groupFile && current !== directory) {
        const pgid = Number(fs.readFileSync(location, 'utf8'));
        if (Number.isSafeInteger(pgid) && pgid > 1) found.push(pgid);
      }
    }
    return found;
  }

  function unlockDirectories(current, info) {
    if (!info.isDirectory()) return; // Never chmod a symlink or a potentially hard-linked file.
    if (info.dev !== original.dev || info.uid !== original.uid) {
      throw new Error(`Unexpected directory owner or filesystem at ${current}`);
    }
    if ((info.mode & 0o700) !== 0o700) fs.chmodSync(current, info.mode | 0o700);
    for (const child of fs.readdirSync(current, { withFileTypes: true })) {
      if (child.isDirectory()) {
        const location = path.join(current, child.name);
        unlockDirectories(location, fs.lstatSync(location));
      }
    }
  }

  return {
    detached: true,
    directory,
    stop: (child, signal) => signalGroup(child.pid, signal),
    register(pid) {
      if (pid) fs.writeFileSync(path.join(directory, groupFile), String(pid));
    },
    async cleanup(pid) {
      // A runner may have closed its stdio while a descendant is still using its temporary files.
      // A group that outlives the grace period is killed and still fails the run.
      let killed = await endGroup(pid, 5000);
      const current = fs.lstatSync(directory, { throwIfNoEntry: false });
      if (current) {
        if (
          !current.isDirectory() ||
          current.ino !== original.ino ||
          current.dev !== original.dev
        ) {
          throw new Error(`Test scratch directory was replaced: ${directory}`);
        }
        unlockDirectories(directory, current);
        // A nested group whose supervisor has gone is orphaned: terminate it before removal.
        for (const nested of nestedGroups(directory)) {
          if (signalGroup(nested, 'SIGTERM')) killed = (await endGroup(nested, 2000)) || killed;
        }
        fs.rmSync(directory, { recursive: true, force: true });
      }
      if (killed) throw new Error('Test subprocesses were still running and were killed');
    },
  };
}
