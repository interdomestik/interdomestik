'use server';

import type { ClaimPackInput } from '@interdomestik/domain-claims/claim-pack';
import { headers } from 'next/headers';

import { generateClaimPackCore, type GenerateClaimPackResult } from './claim-pack-internal';

export async function generateClaimPackAction(
  input: ClaimPackInput
): Promise<GenerateClaimPackResult> {
  return generateClaimPackCore({
    requestHeaders: await headers(),
    input,
  });
}
