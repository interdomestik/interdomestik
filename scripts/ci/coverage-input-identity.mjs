import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { readLocalGitObjectId } from './main-e2e-reuse-github.mjs';

const ENVIRONMENT =
  /^(?:DATABASE|BETTER_AUTH|NEXT_PUBLIC|UPSTASH|SUPABASE|E2E|PW_|TURBO_|INTERDOMESTIK_TURBO)|^(?:CI|NODE_ENV|NODE_OPTIONS|TZ)$/u;
const IMAGE_KEYS = ['RUNNER_OS', 'RUNNER_ARCH', 'ImageOS', 'ImageVersion'];

export function coverageInputIdentity({
  tree,
  node,
  pnpm,
  packageManager,
  env,
  environmentKeys = [],
}) {
  if (
    !/^[0-9a-f]{40}$/u.test(tree) ||
    !/^v24\.\d+\.\d+$/u.test(node) ||
    packageManager !== `pnpm@${pnpm}` ||
    !/^\d+\.\d+\.\d+$/u.test(pnpm) ||
    IMAGE_KEYS.some(key => typeof env[key] !== 'string' || !env[key])
  ) {
    throw new Error('Coverage execution identity unavailable');
  }
  const environment = Object.fromEntries(
    Object.keys(env)
      .filter(key => ENVIRONMENT.test(key) || environmentKeys.includes(key))
      .sort()
      .map(key => [key, env[key]])
  );
  const image = Object.fromEntries(IMAGE_KEYS.map(key => [key, env[key]]));
  return createHash('sha256')
    .update(JSON.stringify({ version: 1, tree, node, pnpm, image, environment }))
    .digest('hex');
}

export function readCoverageInputIdentity(root, env = process.env) {
  // Generated ignored coverage files are expected; tracked source changes invalidate proof.
  execFileSync('/usr/bin/git', ['diff', '--quiet', 'HEAD', '--'], { cwd: root, stdio: 'ignore' });
  const workflow = yaml.load(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
  return coverageInputIdentity({
    tree: readLocalGitObjectId(root, 'HEAD^{tree}'),
    node: process.version,
    pnpm: execFileSync('pnpm', ['--version'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim(),
    packageManager: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
      .packageManager,
    env,
    environmentKeys: [
      ...Object.keys(workflow.env ?? {}),
      ...Object.keys(workflow.jobs.unit.env ?? {}),
    ],
  });
}
