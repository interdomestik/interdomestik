import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dataRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/data');

async function dataFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? dataFiles(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

const fixtureKey = file => path.relative(dataRoot, file).replace(/\.(json|mjs)$/u, '');

test('keeps every generated fixture module in exact parity with authoritative JSON', async () => {
  const files = await dataFiles(dataRoot);
  const jsonFiles = files.filter(file => file.endsWith('.json')).sort();
  const moduleFiles = files.filter(file => file.endsWith('.mjs')).sort();
  assert.equal(jsonFiles.length, 12);
  assert.deepEqual(moduleFiles.map(fixtureKey), jsonFiles.map(fixtureKey));

  for (const jsonFile of jsonFiles) {
    const moduleFile = jsonFile.replace(/\.json$/u, '.mjs');
    const jsonText = await readFile(jsonFile, 'utf8');
    const moduleText = await readFile(moduleFile, 'utf8');
    const literal = jsonText
      .trim()
      .replace(/\\/gu, '\\\\')
      .replace(/'/gu, "\\'")
      .replace(/\r/gu, '\\r')
      .replace(/\n/gu, '\\n')
      .replace(/\u2028/gu, '\\u2028')
      .replace(/\u2029/gu, '\\u2029');
    const expected = `export default JSON.parse(\n  '${literal}'\n);\n`;
    assert.equal(moduleText, expected);
    const generated = (await import(`${pathToFileURL(moduleFile)}?parity=${Date.now()}`)).default;
    assert.deepEqual(generated, JSON.parse(jsonText));
  }
});
