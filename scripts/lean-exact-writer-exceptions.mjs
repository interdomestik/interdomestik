import { createHash } from 'node:crypto';

const T116_HASH = '0c1facb7a3c248391ce92b308e592219f32ccefb6c4d67ee859011e8968b4fa5';
const T117B_HASHES = new Set([
  '2e16444a55df145af2d5c0aaa2a1968cbc0215fc4fe0d0970374903dcadd647c',
  'dd9eed913fabad637d2e15e6b08b1eae373532a67a6a923d3f5f164ecaa9a410',
]);
const DATA = '18b044d69363404d07682aca7b5944d440cbb1e0066d91cc0cf82578953e3f26';
const PORTAL = '60de5ce927812137cfdcd620d280d2708b488040ddf02a5796131d4c6c1f04a5';
const CHILDREN = new Map([
  [
    'T117B-DATA',
    {
      writerHashes: [DATA],
      predecessor: null,
    },
  ],
  [
    'T117B-PORTAL',
    {
      writerHashes: [PORTAL],
      predecessor: {
        sliceId: 'T117B-DATA',
        writerHash: DATA,
      },
    },
  ],
  [
    'T117B-CUTOVER',
    {
      writerHashes: [
        'a3b7ba9338ba5e453316a55bd499078855c7c911158f43057dc419276d3d749a',
        '9607ebda8ed38b016aefedaec045e22e6ab195b06371d2706ce0f3da9260bf36',
        '2ad45d3a297b0bc686594f4d2855a38dfbe3c825446ae740682fe7a1fb2d440b',
      ],
      predecessor: {
        sliceId: 'T117B-PORTAL',
        writerHash: PORTAL,
      },
    },
  ],
]);
const DOMAIN_READ = /^packages\/domain-member\/src\/(?:case-summary\/.+|index\.ts)$/u;

function writerHash(slice) {
  return Array.isArray(slice?.productWriterPaths)
    ? createHash('sha256').update(JSON.stringify(slice.productWriterPaths)).digest('hex')
    : null;
}

export function exactWriterClassification(path, slice) {
  const hash = writerHash(slice);
  if (
    slice?.sliceId === 'T-116-CASE-SUMMARY' &&
    slice?.tier === 2 &&
    hash === T116_HASH &&
    DOMAIN_READ.test(path) &&
    slice.productWriterPaths.includes(path)
  ) {
    return 'domain_read_projection';
  }
  if (
    ((slice?.sliceId === 'T-117B-PORTAL-RUNTIME' && T117B_HASHES.has(hash)) ||
      t117bChildContract(slice)) &&
    slice?.tier === 3 &&
    slice.productWriterPaths.includes(path)
  ) {
    return 'tier3_portal_runtime';
  }
  return null;
}

export const isT117BPortalRuntime = slice =>
  exactWriterClassification(slice?.productWriterPaths?.[0], slice) === 'tier3_portal_runtime';

export function t117bChildContract(slice) {
  const contract = CHILDREN.get(slice?.sliceId);
  return slice?.tier === 3 && contract?.writerHashes.includes(writerHash(slice)) ? contract : null;
}

export function validT117BPredecessor(slice, evidence) {
  const child = t117bChildContract(slice);
  if (!child) return true;
  if (!child.predecessor) {
    return !evidence || (evidence.status === 'root' && evidence.childId === slice.sliceId);
  }
  return (
    evidence?.status === 'verified' &&
    evidence.childId === slice.sliceId &&
    evidence.predecessorSliceId === child.predecessor.sliceId &&
    evidence.predecessorWriterMapSha256 === child.predecessor.writerHash &&
    Number.isSafeInteger(evidence.productPrNumber) &&
    evidence.productPrNumber > 0 &&
    evidence.productState === 'CLOSED' &&
    evidence.productMerged === true &&
    [
      evidence.productHeadSha,
      evidence.productHeadTree,
      evidence.productMergeSha,
      evidence.closeoutMergeSha,
    ].every(sha => /^[a-f0-9]{40}$/u.test(sha ?? '')) &&
    evidence.closeoutState === 'deterministic_closeout_recorded'
  );
}
