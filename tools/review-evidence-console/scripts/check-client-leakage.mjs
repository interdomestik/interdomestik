#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function filesBelow(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await filesBelow(path));
    else rows.push(path);
  }
  return rows;
}

const scanRoots = [resolve(root, 'public')];
if (process.argv.includes('--deployment')) scanRoots.push(resolve(root, '.vercel/output/static'));
const publicFiles = (await Promise.all(scanRoots.map(filesBelow))).flat();
const client = (await Promise.all(publicFiles.map(path => readFile(path, 'utf8').catch(() => '')))).join('\n');
const fixtureFiles = (await filesBelow(resolve(root, 'server/fixtures/data')))
  .filter(path => extname(path) === '.json');
const sharedUiTerms = new Set([
  'Data e verifikimit', 'Executive/Business Owner', 'Kërkon ndryshim',
  'Platform Technical Guardian', 'Të dhënat mjekësore', 'checkbox_group',
  'concreteAnswer', 'multi_select', 'ownerDisplayName', 'requestedChange',
  'reviewerRole', 'riskCategory', 'stopCondition',
]);
const sentinels = [];
for (const path of fixtureFiles) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  JSON.stringify(value, (_key, item) => {
    if (typeof item === 'string' && item.length >= 12 && !sharedUiTerms.has(item)) sentinels.push(item);
    return item;
  });
}
const fixed = ['-----BEGIN PRIVATE KEY-----', 'acct_gazmend', 'acct_sanja', 'acct_fiona', 'acct_arben'];
const leaked = [...new Set([...fixed, ...sentinels])].filter(value => client.includes(value));
if (leaked.length) throw new Error(`Client leakage scan failed (${leaked.length} sentinel(s)).`);
process.stdout.write(`Client leakage scan passed across ${publicFiles.length} files.\n`);
