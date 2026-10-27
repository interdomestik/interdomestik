// Fixed producer-owned observation data. This adds no trusted-source class.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { exact } from './db-access-provider-runtime-identity.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';

const fail = () => {
  throw Error('M4 lineage observation refused: fixed catalog storage');
};
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const indexFile = 'scripts/ci/db-access-m4-lineage-catalog.json';
const shardFiles = [
  'scripts/ci/db-access-m4-lineage-catalog-frontier.json',
  'scripts/ci/db-access-m4-lineage-catalog-sites-1.json',
  'scripts/ci/db-access-m4-lineage-catalog-sites-2.json',
];
const sameKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const read = file => {
  const descriptor = PROVIDER_UNIT_POLICY.producerFiles[file];
  if (!descriptor || descriptor.bytes > 131072 || descriptor.mode !== '100644') fail();
  const bytes = exact(root, file, descriptor);
  const value = JSON.parse(bytes);
  return value;
};
const index = read(indexFile);
if (
  !sameKeys(index, [
    'storageVersion',
    'version',
    'kind',
    'basisCommit',
    'shards',
    'runtimeAdmission',
    'productionCCredit',
    'historicalIdentitySelection',
    'parserVersion',
    'reconstructedSha256',
  ]) ||
  index.storageVersion !== 1 ||
  !Array.isArray(index.shards) ||
  index.shards.length !== shardFiles.length ||
  !/^[a-f0-9]{64}$/u.test(index.reconstructedSha256)
)
  fail();
const shards = shardFiles.map((file, i) => {
  const entry = index.shards[i],
    expected = PROVIDER_UNIT_POLICY.producerFiles[file];
  if (
    !sameKeys(entry, ['file', 'sha256', 'bytes', 'mode']) ||
    !expected ||
    entry.file !== file ||
    ['sha256', 'bytes', 'mode'].some(key => entry[key] !== expected[key])
  )
    fail();
  return read(file);
});
if (
  !sameKeys(shards[0], ['version', 'kind', 'frontier']) ||
  shards[0].version !== 1 ||
  shards[0].kind !== 'frontier' ||
  !sameKeys(shards[1], ['version', 'kind', 'sites']) ||
  !sameKeys(shards[2], ['version', 'kind', 'sites']) ||
  shards[1].version !== 1 ||
  shards[2].version !== 1 ||
  shards[1].kind !== 'sites-1' ||
  shards[2].kind !== 'sites-2' ||
  !Array.isArray(shards[1].sites) ||
  !Array.isArray(shards[2].sites) ||
  shards[1].sites.length !== 20 ||
  shards[2].sites.length !== 20 ||
  !shards[0].frontier ||
  typeof shards[0].frontier !== 'object' ||
  Array.isArray(shards[0].frontier) ||
  Object.keys(shards[0].frontier).length !== 90
)
  fail();
const sites = [...shards[1].sites, ...shards[2].sites];
if (
  sites.some(site => !site || typeof site.id !== 'string' || !site.id) ||
  new Set(sites.map(site => site.id)).size !== sites.length
)
  fail();
const catalog = {
  version: index.version,
  kind: index.kind,
  basisCommit: index.basisCommit,
  frontier: shards[0].frontier,
  sites,
  runtimeAdmission: index.runtimeAdmission,
  productionCCredit: index.productionCCredit,
  historicalIdentitySelection: index.historicalIdentitySelection,
  parserVersion: index.parserVersion,
};
if (
  createHash('sha256').update(JSON.stringify(catalog)).digest('hex') !== index.reconstructedSha256
)
  fail();
export const M4_LINEAGE_CATALOG = freeze(catalog);
if (ts.version !== M4_LINEAGE_CATALOG.parserVersion)
  throw Error('M4 lineage observation refused: fixed parser contract');
