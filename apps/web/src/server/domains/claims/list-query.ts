import 'server-only';

import { assertNoTenantLeak } from '../tenant-leak';
import { getClaimsListQuery } from './queries';
import type { ClaimsListV2Filters } from './types';

export async function getTenantSafeClaimsListQuery(
  filters: ClaimsListV2Filters,
  expectedTenantId: string
) {
  const result = await getClaimsListQuery(filters);

  assertNoTenantLeak(result.rows, expectedTenantId);

  return result;
}
