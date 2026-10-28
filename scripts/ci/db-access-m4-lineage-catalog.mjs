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
  'scripts/ci/db-access-m4-lineage-catalog-sites-3.json',
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
    'sourceClass',
    'historicalCatalogReference',
  ]) ||
  index.storageVersion !== 1 ||
  index.sourceClass !== 'retained-live-with-qualification-only-tls-v1' ||
  index.historicalCatalogReference !==
    '16fe6ea2cb5642f832ccf9ccc71a121bac1836210b8d58df1129f5ae4c07722c' ||
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
  !sameKeys(shards[3], ['version', 'kind', 'sites']) ||
  shards[1].version !== 1 ||
  shards[2].version !== 1 ||
  shards[3].version !== 1 ||
  shards[1].kind !== 'sites-1' ||
  shards[2].kind !== 'sites-2' ||
  shards[3].kind !== 'sites-3' ||
  !Array.isArray(shards[1].sites) ||
  !Array.isArray(shards[2].sites) ||
  !Array.isArray(shards[3].sites) ||
  shards[1].sites.length !== 20 ||
  shards[2].sites.length !== 21 ||
  shards[3].sites.length !== 3 ||
  !shards[0].frontier ||
  typeof shards[0].frontier !== 'object' ||
  Array.isArray(shards[0].frontier) ||
  Object.keys(shards[0].frontier).length !== 99
)
  fail();
const sites = [...shards[1].sites, ...shards[2].sites, ...shards[3].sites];
if (
  sites.some(site => !site || typeof site.id !== 'string' || !site.id) ||
  new Set(sites.map(site => site.id)).size !== sites.length
)
  fail();
// These seven exact records distinguish restored live owners from qualification-only sources.
// No source equivalence, runtime admission or old-identity coverage follows from observation.
const affectedSitePins = {
  'legacy-admin-pre-and-post-read/retained/0':
    'ad86f9ed4ea54184f716e239cae431a33369cfe195dab72964c1d69b30e21a73',
  'two-returned-mock-factories/retained/0':
    '09144b3e8e69aadb9451e0cf94e88c145fd6ed8a53b2fb5405fe6ee684ad844f',
  'legacy-agent-domain-effects/retained/0':
    'c299fd64ee3523386767743cc9126a217eb53b544bb88849cacd9050d8a18cf3',
  'staff-domain-effects/retained/0':
    'd9d9a7bca87039622ca9907b7db2e74f09a62a8cc3b9784230103615e7047793',
  'qualification-assignment-source/observation/0':
    'f47e4b4d1346277c421f59b7d29cc06f06060a677007cd37076af152e9d25810',
  'qualification-assignment-source/observation/1':
    'de93b23a080e27511c38777aa561c1922c2ad6d84c042f621c6b8ca0f8b17b61',
  'qualification-assignment-source/observation/2':
    '4d465fc36cf1c312d5f19c8bcd82ffa0e6098944d05cb6cd6fa711b84f496bbf',
  'notification-and-email/replacement/2':
    'f46bf46591818b5e391ac91b0debaff8332ab2aa35e9742e656783eb49ce21be',
  'new-private-bootstrap-and-protocol/replacement/0':
    '82cf83ec9af6719d13641857e7f3c918ba4e4f111f9c7dafeebf5cc101c3882c',
  'new-private-bootstrap-and-protocol/replacement/2':
    'd56307fd68644c48fffa5a958064bce60cec627736affab81a0ab6353f222528',
  'mounted-assignment-current/residual/6':
    '18d23045c6bb01be6fbad9c19a6c520279764086f03ebd363ea5cc64dc2e8852',
  'mounted-assignment-current/residual/7':
    '4c23b3c045a1a3f09a84d9d8d4dfb8f5618508a0168c01885c7b509ec9462aad',
  'mounted-assignment-current/residual/10':
    '17bc66e7484ef2213bd87bd8ecdf3f7db67acf14cc972c10d36b6d960a855e2d',
  'strict-private-helper/source-observation/m4-runtime-command':
    'eed3019af11be5400ec0199d3a395109cb22b7280a6e1e2185d746e9c7682a77',
  'strict-private-helper/source-observation/m4-runtime-retirement':
    'c452248234260da4f86ca795b42d36889a09f6f4034ae07b7546ca2b51507261',
  'strict-private-helper/source-observation/m4-assignment-owner-capture':
    '569bdac42fc036da27f808a165c8a6dd11764ad089d76e810bb8a72142ba4ee6',
  'captured-endpoint-tls/source-observation/0':
    'c41ac08f330319ce7678bb825eab8e8ccdccb52303a0b54c9cfe0b8e4b09a929',
};
for (const [id, sha256] of Object.entries(affectedSitePins)) {
  const selected = sites.filter(site => site.id === id);
  if (
    selected.length !== 1 ||
    createHash('sha256').update(JSON.stringify(selected[0])).digest('hex') !== sha256
  )
    fail();
}
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
  sourceClass: index.sourceClass,
  historicalCatalogReference: index.historicalCatalogReference,
};
if (
  createHash('sha256').update(JSON.stringify(catalog)).digest('hex') !== index.reconstructedSha256
)
  fail();
export const M4_LINEAGE_CATALOG = freeze(catalog);
if (ts.version !== M4_LINEAGE_CATALOG.parserVersion)
  throw Error('M4 lineage observation refused: fixed parser contract');
