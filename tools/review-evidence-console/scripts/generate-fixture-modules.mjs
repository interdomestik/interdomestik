import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = Object.freeze([
  'public/data/assignments.json',
  'public/data/reviewers.json',
  'public/data/packets/mob-03a-part-a.json',
  'public/data/packets/mob-03a-part-b.json',
  'public/data/items/m03a-access-roles.json',
  'public/data/items/m03a-consent-fields.json',
  'public/data/items/m03a-document-boundary.json',
  'public/data/items/m03a-erasure-revocation.json',
  'public/data/items/m03a-medical-boundary.json',
  'public/data/items/m03a-privacy-owner.json',
  'public/data/items/m03a-scope-stops.json',
  'public/data/items/m03a-threat-recheck.json',
]);

export function renderFixtureModule(jsonText) {
  JSON.parse(jsonText);
  const literal = jsonText
    .trim()
    .replace(/\\/gu, '\\\\')
    .replace(/'/gu, "\\'")
    .replace(/\r/gu, '\\r')
    .replace(/\n/gu, '\\n')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
  return `export default JSON.parse(\n  '${literal}'\n);\n`;
}

export async function syncFixtureModules({ write = false } = {}) {
  const drift = [];
  for (const source of SOURCES) {
    const jsonPath = path.join(toolRoot, source);
    const modulePath = jsonPath.replace(/\.json$/u, '.mjs');
    const expected = renderFixtureModule(await readFile(jsonPath, 'utf8'));
    const actual = await readFile(modulePath, 'utf8').catch(error => {
      if (error?.code === 'ENOENT') return '';
      throw error;
    });
    if (actual === expected) continue;
    if (write) await writeFile(modulePath, expected);
    else drift.push(path.relative(toolRoot, modulePath));
  }
  return drift;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (
    args.some(arg => !['--check', '--write'].includes(arg)) ||
    (args.includes('--check') && args.includes('--write'))
  ) {
    throw new Error('Use exactly one of --check or --write.');
  }
  const write = args.includes('--write');
  const drift = await syncFixtureModules({ write });
  if (drift.length > 0) {
    console.error(`Fixture module drift:\n${drift.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(write ? 'Fixture modules generated.' : 'Fixture modules are in parity.');
  }
}
