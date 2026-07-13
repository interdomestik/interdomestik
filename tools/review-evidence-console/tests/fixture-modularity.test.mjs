import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const consoleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedDirectories = new Set(['.vercel', 'node_modules']);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(entry => !generatedDirectories.has(entry.name))
      .map(entry => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath];
      })
  );
  return nested.flat();
}

test('keeps console JSON, MJS, and test files at or below 150 lines', async () => {
  const oversized = [];
  for (const file of await sourceFiles(consoleRoot)) {
    if (!file.endsWith('.json') && !file.endsWith('.mjs')) continue;
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/u).length - Number(content.endsWith('\n'));
    if (lines > 150) oversized.push(`${path.relative(consoleRoot, file)}: ${lines}`);
  }
  assert.deepEqual(oversized, []);
});
