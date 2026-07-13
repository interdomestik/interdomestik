import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { registryFingerprint } from './account-mutations.mjs';

export const PINS = Object.freeze({
  teamId: 'team_zZnOjQLylAZArqxcUhLbHDHc',
  projectId: 'prj_Yn7w7tQEAJYaALs2gL2FR9UWgHCc',
  projectName: 'interdomestik-reviewer-portal',
  environment: 'preview',
});

export function invokeVercel(args, { stdin = '', spawnImpl = spawn, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('vercel', args, {
      cwd,
      shell: false,
      stdio: ['pipe', 'ignore', 'pipe'],
      env: process.env,
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', () => reject(new Error('Vercel command could not start.')));
    child.on('close', code =>
      code === 0
        ? resolve({ code })
        : reject(new Error(`Vercel command failed (${code}): ${stderr.slice(0, 200)}`))
    );
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export async function readRemoteRegistry({ cwd, invoke = invokeVercel } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'rec02-env-'));
  const target = join(directory, 'preview.env');
  try {
    await invoke(
      ['env', 'pull', target, '--yes', '--environment', PINS.environment, '--scope', PINS.teamId],
      { cwd }
    );
    const line = (await readFile(target, 'utf8'))
      .split('\n')
      .find(row => row.startsWith('REVIEW_PORTAL_ACCOUNTS_JSON='));
    if (!line) throw new Error('Remote reviewer registry is unavailable.');
    const raw = line.slice(line.indexOf('=') + 1);
    return raw.startsWith('"') ? JSON.parse(raw) : raw;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function applyRegistry({
  json,
  expectedFingerprint,
  readRemote,
  fingerprint = value => registryFingerprint(JSON.parse(value)),
  compareAndSwap,
}) {
  const before = fingerprint(await readRemote());
  if (before !== expectedFingerprint) throw new Error('Refused stale registry update.');
  if (typeof compareAndSwap !== 'function') throw new Error('Atomic Vercel CAS is unavailable.');
  const intended = fingerprint(json);
  if (
    (await compareAndSwap({ expectedFingerprint, intendedFingerprint: intended, json })) !== true
  ) {
    throw new Error('Refused concurrent registry update.');
  }
  const after = fingerprint(await readRemote());
  if (after !== intended)
    throw new Error('Registry partial failure: post-write verification differs.');
  return Object.freeze({ fingerprint: after });
}

export function assertProjectPin(project) {
  if (
    project?.projectId !== PINS.projectId ||
    project?.orgId !== PINS.teamId ||
    project?.projectName !== PINS.projectName
  ) {
    throw new Error('Vercel project pin mismatch.');
  }
  return true;
}
