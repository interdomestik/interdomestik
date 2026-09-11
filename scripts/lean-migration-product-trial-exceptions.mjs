import { createHash } from 'node:crypto';

const CONTRACTS = new Map([
  [
    'MIGRATION-CURRENCY-PARSING-TRIAL-1',
    'd28e9bef19d9188ef963605909c009b333c4cab242fb15f61521f5ade5ba7d5b',
  ],
]);

function writerHash(slice) {
  return Array.isArray(slice?.productWriterPaths)
    ? createHash('sha256').update(JSON.stringify(slice.productWriterPaths)).digest('hex')
    : null;
}

export function isExact(slice) {
  return slice?.tier === 3 && CONTRACTS.get(slice.sliceId) === writerHash(slice);
}

export function classify(path, slice) {
  return isExact(slice) && slice.productWriterPaths.includes(path)
    ? 'tier3_migration_product_trial'
    : null;
}
