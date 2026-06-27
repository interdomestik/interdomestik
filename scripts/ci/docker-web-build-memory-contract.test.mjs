import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('web Docker build caps Next workers and enables webpack memory optimizations', () => {
  const dockerfile = readRepoFile('apps/web/Dockerfile');
  const nextConfig = readRepoFile('apps/web/next.config.mjs');

  assert.match(dockerfile, /ENV NEXT_BUILD_CPUS=1/);
  assert.match(dockerfile, /ENV NEXT_WEBPACK_MEMORY_OPTIMIZATIONS=1/);
  assert.match(dockerfile, /ENV NODE_OPTIONS="--max-old-space-size=4096"/);
  assert.match(nextConfig, /NEXT_BUILD_CPUS/u);
  assert.match(nextConfig, /cpus: buildCpus/u);
  assert.match(nextConfig, /NEXT_WEBPACK_MEMORY_OPTIMIZATIONS/u);
  assert.match(nextConfig, /webpackMemoryOptimizations: true/u);
});
