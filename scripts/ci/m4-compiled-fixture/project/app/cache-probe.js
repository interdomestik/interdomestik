import { unstable_cache } from 'next/cache';
import { randomUUID } from 'node:crypto';
let loads = 0;
// A real Next Data Cache witness, never a cached business result or authorization fact.
export const cacheWitness = unstable_cache(
  async (runId, profile, claimId) => ({
    runId,
    profile,
    claimId,
    generation: ++loads,
    token: randomUUID(),
  }),
  ['m4-compiled-cache-witness-v1'],
  { revalidate: false }
);
