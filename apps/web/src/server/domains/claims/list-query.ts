import 'server-only';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { assertNoTenantLeak } from '../tenant-leak';
import { getClaimsListQuery } from './queries';
import type { ClaimsListV2Filters } from './types';

export async function getTenantSafeClaimsListQuery(
  authority: TenantAuthority,
  filters: ClaimsListV2Filters,
  expectedTenantId: string
) {
  const result = await getClaimsListQuery(authority, filters);

  assertNoTenantLeak(result.rows, expectedTenantId);

  return result;
}
