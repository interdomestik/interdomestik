#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { writeTurboCacheKey } from './create-turbo-cache-key.mjs';

const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'];

export function runTurbo(args, { executable, cwd = process.cwd(), env = process.env } = {}) {
  writeTurboCacheKey(cwd);

  const localExecutable =
    executable ??
    path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'turbo.cmd' : 'turbo');
  const child = spawn(localExecutable, args, { cwd, env, stdio: 'inherit' });
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
