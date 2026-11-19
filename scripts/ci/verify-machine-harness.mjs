// Test harness for verify-machine.mjs: injected dependencies and a temporary record directory.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fixtureLive, fixtureMarker } from './verify-machine-fixtures.mjs';
import * as records from './verify-machine-records.mjs';

export const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
export const HEAD = 'c'.repeat(40);
export const MARKER_SHA = 'f'.repeat(64);

export const trusted = (marker = fixtureMarker()) => ({
  status: 'trusted',
  marker,
  sha256: MARKER_SHA,
});

export function harness({ marker = { status: 'absent' }, live = fixtureLive(), env = {} } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'verify-machine-'));
  const output = { log: [], error: [] };
  const state = { marker, live, git: { head: HEAD, clean: true, trackedClean: true } };
  const deps = {
    env: { npm_lifecycle_event: 'pr:verify', ...env },
    platform: 'darwin',
    cwd: '/repo',
    shellPid: 4242,
    chain: {
      scripts: () => packageJson.scripts,
      parentCommand: () =>
        state.parent ?? `sh -c ${packageJson.scripts[deps.env.npm_lifecycle_event]}\n`,
      bail: () => state.bail ?? 'undefined\n',
      hooksDirectory: () => state.hooksDirectory ?? false,
    },
    exec: (command, args) => {
      assert.deepEqual([command, ...args], ['git', 'rev-parse', '--show-toplevel']);
      return '/repo';
    },
    readMarker: () => state.marker,
    probe: () => state.live,
    gitState: () => state.git,
    records: { ...records, recordDirectory: () => directory },
    now: () => '2026-11-19T10:00:00.000Z',
    log: message => output.log.push(message),
    error: message => output.error.push(message),
  };
  const files = () => readdirSync(directory).sort();
  const finalName = () => files().find(name => !name.startsWith('pending'));
  return {
    directory,
    deps,
    state,
    output,
    files,
    readFinal: () => JSON.parse(readFileSync(path.join(directory, finalName()), 'utf8')),
    cleanup: () => rmSync(directory, { recursive: true }),
  };
}
