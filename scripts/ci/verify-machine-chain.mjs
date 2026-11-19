// Gate evidence needs proof that `begin` and `stamp` ran inside the unchanged pnpm chain of their
// lane: pnpm runs a script as `sh -c <script>`, and `&&` reaches `stamp` only after every step
// before it exited 0. A shell typed by hand, an edited chain or another script cannot stamp.
import { readFileSync } from 'node:fs';
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
  };
}

export function chainErrors(lane, { env, repoRoot, chain }) {
  const scriptName = LANE_SCRIPTS[lane];
  const errors = [];
  if (env.npm_lifecycle_event !== scriptName) {
    errors.push(`gate evidence comes only from \`pnpm ${scriptName}\``);
  }
  let script;
  let parent;
  try {
    script = chain.scripts(repoRoot)[scriptName];
    parent = chain.parentCommand().trim();
  } catch {
    return [...errors, `the ${scriptName} chain could not be read`];
  }
  if (!script || parent !== `sh -c ${script}`) {
    errors.push(`this step is not running inside the unchanged ${scriptName} chain`);
  }
  return errors;
}
