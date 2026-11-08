import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

const marker = 'INTERDOMESTIK_CONTRACT_TMPDIR';
const prefix = 'interdomestik-contract-';

export function contractScratch(env) {
  // A contract can invoke the runner itself. Its subprocesses must stay in the outer group.
  if (process.platform === 'win32' || (env[marker] && env[marker] === os.tmpdir())) {
    return { detached: false, stop: (child, signal) => child.kill(signal), cleanup() {} };
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
    stop: (child, signal) => signalGroup(child.pid, signal),
    async cleanup(pid) {
      // A runner may have closed its stdio while a descendant is still using its temporary files.
      const deadline = performance.now() + 5000;
      while (signalGroup(pid, 0)) {
        if (performance.now() >= deadline) throw new Error('Test subprocesses are still running');
        await setTimeout(50);
      }

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
