// Gate evidence needs proof that `begin` and `stamp` ran inside the unchanged pnpm chain of their
// lane: pnpm runs a script as `sh -c <script>`, and `&&` reaches `stamp` only after every step
// before it exited 0. A shell typed by hand, an edited chain or another script cannot stamp.
// Two pnpm features could still let a failure through: `bail=false` makes a failing nested
// workspace run exit 0, and a lifecycle hook (`post<script>` or `node_modules/.hooks`) runs after
// `stamp`. Gate mode refuses both.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { runCommand } from './verify-machine-probe.mjs';

export const LANE_SCRIPTS = Object.freeze({
  'pr-verify': 'pr:verify',
  'security-guard': 'security:guard',
});

export function defaultChainProbe(shellPid) {
  return {
    scripts: repoRoot =>
      JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts ?? {},
    parentCommand: () => runCommand('ps', ['-ww', '-o', 'command=', '-p', String(shellPid)]),
    bail: repoRoot => runCommand('pnpm', ['config', 'get', 'bail'], repoRoot),
    hooksDirectory: repoRoot => existsSync(path.join(repoRoot, 'node_modules', '.hooks')),
  };
}

// pnpm's default is to bail; `undefined` means no setting overrides it.
const BAILING = new Set(['true', 'undefined']);

function lifecycleErrors(scriptName, scripts, repoRoot, chain) {
  const errors = [];
  if (scripts[`post${scriptName}`] !== undefined) {
    errors.push(`a post${scriptName} script would run after the stamp`);
  }
  if (chain.hooksDirectory(repoRoot)) {
    errors.push('node_modules/.hooks holds lifecycle hooks that could run after the stamp');
  }
  if (!BAILING.has(chain.bail(repoRoot).trim())) {
    errors.push('pnpm bail must stay on, so a failing nested run fails the chain');
  }
  return errors;
}

export function chainErrors(lane, { env, repoRoot, chain }) {
  const scriptName = LANE_SCRIPTS[lane];
  const errors = [];
  if (env.npm_lifecycle_event !== scriptName) {
    errors.push(`gate evidence comes only from \`pnpm ${scriptName}\``);
  }
  let scripts;
  let parent;
  let lifecycle;
  try {
    scripts = chain.scripts(repoRoot);
    parent = chain.parentCommand().trim();
    lifecycle = lifecycleErrors(scriptName, scripts, repoRoot, chain);
  } catch {
    return [...errors, `the ${scriptName} chain could not be read`];
  }
  const script = scripts[scriptName];
  if (!script || parent !== `sh -c ${script}`) {
    errors.push(`this step is not running inside the unchanged ${scriptName} chain`);
  }
  return [...errors, ...lifecycle];
}
