import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sha256Hex } from './verify-machine-marker.mjs';

export const LANES = Object.freeze(['pr-verify', 'security-guard']);
export const MODES = Object.freeze({ gate: 'GATE-EVIDENCE', preCheck: 'PRE-CHECK' });

const DEFAULT_FS = { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync };

/** Run records live outside the repository, in the developer's log directory. */
export function recordDirectory({ platform, env, home = os.homedir() }) {
  if (platform === 'darwin') return path.join(home, 'Library/Logs/interdomestik-verify');
  return path.join(env.XDG_STATE_HOME || path.join(home, '.local/state'), 'interdomestik-verify');
}

export function pendingRecordPath(directory, repoRoot, lane) {
  return path.join(directory, `pending-${lane}-${sha256Hex(repoRoot).slice(0, 16)}.json`);
}

export function finalRecordPath(directory, record) {
  const stamp = record.finishedAt.replaceAll(':', '').replaceAll('.', '');
  return path.join(directory, `${stamp}-${record.lane}-${record.head.slice(0, 12)}.json`);
}

export function writeRecord(filePath, record, fs = DEFAULT_FS) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return sha256Hex(text);
}

export function readRecord(filePath, fs = DEFAULT_FS) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function removeRecord(filePath, fs = DEFAULT_FS) {
  fs.rmSync(filePath, { force: true });
}

/** The recorded configuration: versions, ports and the image, never URLs or credentials. */
export function recordedConfiguration(marker, live) {
  return {
    arch: live.arch,
    os: live.os,
    node: live.node,
    pnpm: live.pnpm,
    containerRuntime: live.container,
    database: {
      image: live.database?.image ?? null,
      host: marker.database.host,
      port: marker.database.port,
      name: marker.database.name,
    },
    appPort: marker.app_port,
    freeGib: live.freeGib,
  };
}
