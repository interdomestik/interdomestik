import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sha256Hex } from './verify-machine-marker.mjs';

export {
  PENDING_VERSION,
  pruneStalePending,
  readShellStart,
  shellPendingRecords,
} from './verify-machine-pending.mjs';

export const LANES = Object.freeze(['pr-verify', 'security-guard']);
export const MODES = Object.freeze({ gate: 'GATE-EVIDENCE', preCheck: 'PRE-CHECK' });

const DEFAULT_FS = { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync };

/**
 * Run records live outside the repository, in the account's log directory. The home directory
 * comes from the account, never from HOME or XDG_STATE_HOME, so a changed variable cannot point
 * `stamp` at another directory than its `begin`.
 */
export function recordDirectory({ platform, home = os.userInfo().homedir }) {
  if (platform === 'darwin') return path.join(home, 'Library/Logs/interdomestik-verify');
  return path.join(home, '.local/state/interdomestik-verify');
}

/**
 * One pending record per shell process (its PID and start time): `begin` and `stamp` are children
 * of the same shell.
 */
export function pendingRecordPath(directory, repoRoot, lane, shell) {
  const scope = sha256Hex(`${repoRoot}\0${shell}`).slice(0, 16);
  return path.join(directory, `pending-${lane}-${scope}.json`);
}

/** One final record per run: its name carries the run ID that `begin` gave the run. */
export function finalRecordPath(directory, record) {
  return path.join(directory, `${record.lane}-${record.head.slice(0, 12)}-${record.runId}.json`);
}

export function writeRecord(filePath, record, fs = DEFAULT_FS) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return sha256Hex(text);
}

/**
 * Publishes a final record exactly once. The temporary file is new (`wx`, a unique name), and the
 * link fails with EEXIST when the run already has a record, so a repeated or concurrent stamp can
 * never replace or change it. The link's error wins over a failed cleanup; after a successful
 * link, a failed cleanup is only reported.
 */
export function publishRecord(filePath, record, warn = () => {}, fs = DEFAULT_FS) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' });
  let linkError = null;
  try {
    fs.linkSync(temporary, filePath);
  } catch (error) {
    linkError = error;
  }
  try {
    fs.rmSync(temporary, { force: true });
  } catch (error) {
    if (!linkError) warn(error);
  }
  if (linkError) throw linkError;
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
