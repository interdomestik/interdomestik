#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { writeTurboCacheKey } from './create-turbo-cache-key.mjs';

const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INFORMATIONAL_FLAGS = new Set(['--help', '-h', '--version', '-v']);

function explicitCacheMode(args) {
  const argument = args.find(candidate => candidate.startsWith('--cache='));
  return argument?.slice('--cache='.length);
}

export function resolveTurboArgs(args, env) {
  if (!args[0] || INFORMATIONAL_FLAGS.has(args[0])) return args;
  const signatureKey = env.TURBO_REMOTE_CACHE_SIGNATURE_KEY?.trim();
  const cacheMode = explicitCacheMode(args);
  const ambiguousCache = args.includes('--cache');
  const remoteOnly = args.includes('--remote-only');
  const legacyReadOnly = args.includes('--remote-cache-read-only');

  if (!signatureKey) {
    if (ambiguousCache || remoteOnly || legacyReadOnly || cacheMode?.includes('remote')) {
      throw new Error('Remote Turbo cache options require the artifact signature key');
    }
    return cacheMode ? args : [...args, '--cache=local:rw'];
  }
  if (env.INTERDOMESTIK_TURBO_REMOTE_CACHE_READ_ONLY === '1') {
    if (
      ambiguousCache ||
      remoteOnly ||
      cacheMode?.split(',').some(mode => mode.startsWith('remote:') && mode !== 'remote:r')
    ) {
      throw new Error('Pull-request Turbo cache policy forbids remote writes');
    }
    if (cacheMode || legacyReadOnly) return args;
    return [...args, '--cache=remote:r,local:rw'];
  }
  return args;
}

export function runTurbo(
  args,
  { executable, cwd = process.cwd(), env = process.env, root = repoRoot } = {}
) {
  const platformKey = writeTurboCacheKey(root);
  const childEnv = {
    ...env,
    INTERDOMESTIK_TURBO_PLATFORM_KEY: JSON.stringify(platformKey),
  };

  const turboArgs = resolveTurboArgs(args, childEnv);
  const localExecutable = executable ?? process.execPath;
  const executableArgs = executable
    ? turboArgs
    : [path.join(root, 'node_modules', 'turbo', 'bin', 'turbo'), ...turboArgs];
  const child = spawn(localExecutable, executableArgs, {
    cwd,
    env: childEnv,
    stdio: 'inherit',
  });
  let childExited = false;
  const handlers = new Map();

  for (const signal of FORWARDED_SIGNALS) {
    const handler = () => {
      if (!childExited) child.kill(signal);
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }

  const cleanup = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };

  child.once('error', error => {
    childExited = true;
    cleanup();
    console.error(`Unable to start Turborepo: ${error.message}`);
    process.exitCode = 1;
  });

  child.once('exit', (code, signal) => {
    childExited = true;
    cleanup();

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = Number.isInteger(code) ? code : 1;
  });

  return child;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runTurbo(process.argv.slice(2));
}
