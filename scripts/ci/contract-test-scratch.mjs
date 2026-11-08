import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

const marker = 'INTERDOMESTIK_CONTRACT_TMPDIR';
// Short on purpose: tools such as tsx create Unix sockets inside TMPDIR, and macOS limits a socket
// path to 103 bytes (its per-user temporary directory alone is about 57).
const prefix = 'idct-';

// Whether a process group still has a member that is not a zombie: null without procfs (macOS),
// where the group signal alone decides.
export function groupHasLiveMember(pgid, procRoot = '/proc') {
  let entries;
  try {
    entries = fs.readdirSync(procRoot);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let stat;
    try {
      stat = fs.readFileSync(path.join(procRoot, entry, 'stat'), 'utf8');
    } catch {
      continue; // The process exited while it was listed.
    }
    // `pid (comm) state ppid pgrp ...`; comm may itself contain spaces and parentheses.
    const [state, , pgrp] = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (Number(pgrp) === pgid && state !== 'Z' && state !== 'X') return true;
  }
  return false;
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
      if (error.code !== 'ESRCH') throw error;
      return false;
    }
  }

  async function waitForGroup(pid, deadline) {
    // Exited descendants that nobody reaped stay as zombies and still answer a group signal.
    if (!signalGroup(pid, 0) || groupHasLiveMember(pid) === false) return;
    if (performance.now() >= deadline) throw new Error('Test subprocesses are still running');
    await setTimeout(50);
    return waitForGroup(pid, deadline);
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
    async cleanup(pid) {
      // A runner may have closed its stdio while a descendant is still using its temporary files.
      await waitForGroup(pid, performance.now() + 5000);

      const current = fs.lstatSync(directory, { throwIfNoEntry: false });
      if (!current) return;
      if (!current.isDirectory() || current.ino !== original.ino || current.dev !== original.dev) {
        throw new Error(`Test scratch directory was replaced: ${directory}`);
      }
      unlockDirectories(directory, current);
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
