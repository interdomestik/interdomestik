// Fixed producer-owned observation data. This adds no trusted-source class.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { exact } from './db-access-provider-runtime-identity.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = 'scripts/ci/db-access-m4-lineage-catalog.json';
export const M4_LINEAGE_CATALOG = freeze(
  JSON.parse(exact(root, file, PROVIDER_UNIT_POLICY.producerFiles[file]))
);
if (ts.version !== M4_LINEAGE_CATALOG.parserVersion)
  throw Error('M4 lineage observation refused: fixed parser contract');
