import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('defines governed unit, browser, aggregate, and verify scripts', async () => {
  const text = await readFile(path.join(toolRoot, 'package.json'), 'utf8').catch(() => null);
  assert.ok(text, 'tool package.json must exist');
  const scripts = JSON.parse(text).scripts;
  assert.match(scripts['test:unit'], /node --test tests\/\*\.test\.mjs/u);
  assert.match(scripts['test:browser'], /pnpm --filter @interdomestik\/web exec playwright test/u);
  assert.match(scripts.test, /test:unit.*test:browser/u);
  assert.match(scripts.verify, /fixtures:check.*test/u);
});

test('does not resolve Playwright through a direct node_modules path', async () => {
  const files = ['package.json', 'playwright.config.mjs', 'tests/fixture-browser.spec.mjs'];
  const contents = await Promise.all(
    files.map(file => readFile(path.join(toolRoot, file), 'utf8').catch(() => ''))
  );
  for (const content of contents) assert.doesNotMatch(content, /node_modules/u);
});
