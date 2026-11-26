import { userInfo } from 'node:os';
import { realpathSync } from 'node:fs';
import path from 'node:path';

const WORKER = '_interdomestik_gate_worker';
const safePath = value =>
  typeof value === 'string' && /^\/[^\r\n\0]+$/u.test(value) && path.normalize(value) === value;

export function delegatedGitEnvironment(base, env = process.env, username = userInfo().username) {
  if (username !== WORKER || env.INTERDOMESTIK_M5_CHECKOUT === undefined) return base;
  const root = env.INTERDOMESTIK_M5_CHECKOUT;
  if (!safePath(root) || root.endsWith('/*') || realpathSync(root) !== root) {
    throw new Error('The M5 worker is missing its exact Git checkout admission.');
  }
  return {
    ...base,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
  };
}

export function contractBash(
  fallback = '/bin/bash',
  env = process.env,
  username = userInfo().username
) {
  if (username !== WORKER) return fallback;
  const bash = env.INTERDOMESTIK_M5_BASH;
  if (!safePath(bash)) {
    throw new Error('The M5 worker is missing its enrolled Bash executable.');
  }
  return bash;
}
