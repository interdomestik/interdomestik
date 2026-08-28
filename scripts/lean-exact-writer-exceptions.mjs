import { createHash } from 'node:crypto';

const T116_WRITER_MAP_SHA256 = '0c1facb7a3c248391ce92b308e592219f32ccefb6c4d67ee859011e8968b4fa5';
const T117B_WRITER_MAP_SHA256 = '2e16444a55df145af2d5c0aaa2a1968cbc0215fc4fe0d0970374903dcadd647c';
const DOMAIN_READ_PROJECTION = /^packages\/domain-member\/src\/(?:case-summary\/.+|index\.ts)$/u;

function writerMapSha256(slice) {
  return Array.isArray(slice?.productWriterPaths)
    ? createHash('sha256').update(JSON.stringify(slice.productWriterPaths)).digest('hex')
    : null;
}

export function exactWriterClassification(path, slice) {
  const writerMapSha = writerMapSha256(slice);
  if (
    slice?.sliceId === 'T-116-CASE-SUMMARY' &&
    slice?.tier === 2 &&
    writerMapSha === T116_WRITER_MAP_SHA256 &&
    DOMAIN_READ_PROJECTION.test(path) &&
    slice.productWriterPaths.includes(path)
  ) {
    return 'domain_read_projection';
  }
  if (
    slice?.sliceId === 'T-117B-PORTAL-RUNTIME' &&
    slice?.tier === 3 &&
    writerMapSha === T117B_WRITER_MAP_SHA256 &&
    slice.productWriterPaths.includes(path)
  ) {
    return 'tier3_portal_runtime';
  }
  return null;
}

export const isT117BPortalRuntime = slice =>
  exactWriterClassification(slice?.productWriterPaths?.[0], slice) === 'tier3_portal_runtime';
