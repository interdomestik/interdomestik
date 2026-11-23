// The build-configuration change refusal (the WP-05 flip, D-1; the owner's decision of 2026-11-23,
// "narrow the bar"). The scanner checks only its listed inputs, so a change that adds, removes or
// edits a build-configuration input is refused under enforcement unless a scanner PR reviewed it
// first: a Next config, a Babel config, any `tsconfig*.json` or `jsconfig*.json`, and `.swcrc`, at
// any level and under any new name of these kinds; and a change of a reviewed build wrapper's
// lockfile record (version, own patch, `patchedDependencies`, integrity; r7: compared base against
// head whatever the Next config's state, besides the pins of resolution.mjs). A scanner PR
// admits one reviewed file state by adding its path and the sha256 of its new text (or `absent`
// for a removal) to `REVIEWED_CONFIG_CHANGES`.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { showAt } from '../server-mutation/git.mjs';
import { parseLockfile, wrapperRecords } from './lockfile.mjs';
import { refuse } from './refusal.mjs';
import { REVIEWED_WRAPPERS } from './resolution.mjs';

const GIT = '/usr/bin/git';

// A build-configuration input, by its file name at any level: one pattern per kind, matched against
// the last path segment.
const BUILD_CONFIG_NAMES = Object.freeze([
  /^next\.config\./u,
  /^\.babelrc(?:\.|$)/u,
  /^babel\.config\./u,
  /^tsconfig[^/]*\.json$/u,
  /^jsconfig[^/]*\.json$/u,
  /^\.swcrc$/u,
]);
export const isBuildConfig = rel => {
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  return BUILD_CONFIG_NAMES.some(pattern => pattern.test(name));
};

// path -> the reviewed states it may change to (sha256 of the text, or `absent`); for a wrapper's
// lockfile record, `pnpm-lock.yaml#<name>` -> its reviewed records as `stateOf` prints them. Empty:
// today's configuration is the fixed one.
const REVIEWED_CONFIG_CHANGES = Object.freeze({});

const sha256 = text => createHash('sha256').update(text).digest('hex');

function changedPaths(repo, baseSha, headSha) {
  const result = spawnSync(
    GIT,
    ['-C', repo, 'diff', '--no-renames', '--name-only', '-z', baseSha, headSha],
    {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }
  );
  if (result.status !== 0)
    throw new ScanError(`build-configuration discovery failed: ${String(result.stderr).trim()}`);
  return result.stdout.split('\0').filter(Boolean).sort(byCodeUnit);
}

const LOCKFILE = 'pnpm-lock.yaml';
const wrappersAt = (repo, sha) => {
  const text = showAt(repo, sha, LOCKFILE);
  if (text === null) return null;
  try {
    return wrapperRecords(
      parseLockfile(text, `${LOCKFILE} at ${sha}`),
      Object.keys(REVIEWED_WRAPPERS)
    );
  } catch (error) {
    // Sol r1, r2: a malformed lockfile or entry is a refusal of the fixed configuration too.
    if (error instanceof ScanError) refuse(error.message);
    throw error;
  }
};
// The compared state (Sol r2): the whole record as canonical JSON, so no two different records
// share it, whatever their strings hold. It is also the state an admission names.
const stateOf = record =>
  record === null || record === undefined
    ? 'absent'
    : JSON.stringify([
        record.version,
        record.patch,
        record.patched.map(({ key, hash, path }) => [key, hash, path]),
        record.integrity,
      ]);

// The reviewed wrappers whose lockfile record differs between base and head, each as
// `pnpm-lock.yaml <name> (<base> -> <head>)`.
function wrapperChanges(repo, baseSha, headSha) {
  const base = wrappersAt(repo, baseSha);
  const head = wrappersAt(repo, headSha);
  const out = [];
  for (const name of Object.keys(REVIEWED_WRAPPERS)) {
    const before = stateOf(base?.[name]);
    const after = stateOf(head?.[name]);
    const admitted = (REVIEWED_CONFIG_CHANGES[`${LOCKFILE}#${name}`] ?? []).includes(after);
    if (before !== after && !admitted) out.push(`${LOCKFILE} ${name} (${before} -> ${after})`);
  }
  return out;
}

// The build-configuration inputs the change base..head adds, removes or edits and no scanner PR
// reviewed, each as `<path> (<state>)`, then the changed wrapper records.
export function buildConfigChanges(repo, baseSha, headSha) {
  const out = [];
  const changed = changedPaths(repo, baseSha, headSha);
  if (changed.includes(LOCKFILE)) out.push(...wrapperChanges(repo, baseSha, headSha));
  for (const rel of changed) {
    if (!isBuildConfig(rel)) continue;
    const text = showAt(repo, headSha, rel);
    const state = text === null ? 'absent' : sha256(text);
    if (!(REVIEWED_CONFIG_CHANGES[rel] ?? []).includes(state)) out.push(`${rel} (${state})`);
  }
  return out;
}

export const configRefusal = changes =>
  `the change edits build configuration the scanner does not check (${changes.join(', ')}); a change to it needs a scanner PR first (WP-05 flip, D-1 fixed configuration)`;
