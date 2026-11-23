// The build-configuration change refusal (the WP-05 flip, D-1; the owner's decision of 2026-11-23,
// "narrow the bar"). The scanner checks only its listed inputs, so a change that adds, removes or
// edits a build-configuration input is refused under enforcement unless a scanner PR reviewed it
// first: a Next config, a Babel config, any `tsconfig*.json` or `jsconfig*.json`, and `.swcrc`, at
// any level and under any new name of these kinds. The lockfile entries (version, patch and
// integrity) of the pinned build wrappers are pinned on every tree (resolution.mjs). A scanner PR
// admits one reviewed file state by adding its path and the sha256 of its new text (or `absent`
// for a removal) to `REVIEWED_CONFIG_CHANGES`.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { showAt } from '../server-mutation/git.mjs';

const GIT = '/usr/bin/git';

// A build-configuration input, by its file name at any level.
export const BUILD_CONFIG_RE =
  /(?:^|\/)(?:next\.config\.[^/]+|\.babelrc(?:\.[^/]+)?|babel\.config\.[^/]+|tsconfig[^/]*\.json|jsconfig[^/]*\.json|\.swcrc)$/u;

// path -> the reviewed states it may change to (sha256 of the text, or `absent`). Empty: today's
// configuration is the fixed one.
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

// The build-configuration inputs the change base..head adds, removes or edits and no scanner PR
// reviewed, each as `<path> (<state>)`.
export function buildConfigChanges(repo, baseSha, headSha) {
  const out = [];
  for (const rel of changedPaths(repo, baseSha, headSha)) {
    if (!BUILD_CONFIG_RE.test(rel)) continue;
    const text = showAt(repo, headSha, rel);
    const state = text === null ? 'absent' : sha256(text);
    if (!(REVIEWED_CONFIG_CHANGES[rel] ?? []).includes(state)) out.push(`${rel} (${state})`);
  }
  return out;
}

export const configRefusal = changes =>
  `the change edits build configuration the scanner does not check (${changes.join(', ')}); a change to it needs a scanner PR first (WP-05 flip, D-1 fixed configuration)`;
