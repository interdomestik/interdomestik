#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolveCurrentAuthority } from './current-authority-state-lib.mjs';

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv
    .slice(2)
    .find(item => item.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value) throw new Error(`missing ${prefix}<path>`);
  return value;
}

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

try {
  const result = resolveCurrentAuthority({
    projection: json(argument('projection')),
    durable: json(argument('durable')),
    live: json(argument('live')),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.runtimeAuthorized) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`current authority resolution failed: ${error.message}\n`);
  process.exitCode = 1;
}
