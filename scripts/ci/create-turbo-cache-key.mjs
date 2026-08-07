#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const TURBO_CACHE_KEY_FILE = 'turbo-cache-key.json';

export function createTurboCacheKey() {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number.parseInt(process.versions.node.split('.')[0], 10),
  };
}

export function writeTurboCacheKey(cwd = process.cwd(), key = createTurboCacheKey()) {
  const destination = path.join(cwd, TURBO_CACHE_KEY_FILE);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const serialized = `${JSON.stringify(key)}\n`;

  try {
    writeFileSync(temporary, serialized, { mode: 0o600 });
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }

  return key;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  writeTurboCacheKey();
}
