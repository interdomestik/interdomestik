// v2.0.0-ops — Admin Claims lifecycle hardening
import * as Sentry from '@sentry/nextjs';
import 'server-only';
import { ensureClaimsAccess } from './guards';
import { mapClaimsToDto } from './mappers';
import { getClaimsListQuery } from './queries';
import type { ClaimsListV2Dto, ClaimsListV2Filters } from './types';

export async function getClaimsListV2(
  session: any,
  params: Omit<ClaimsListV2Filters, 'tenantId' | 'role' | 'branchId' | 'userId'>
): Promise<ClaimsListV2Dto> {
  return Sentry.withServerActionInstrumentation(
    'claims.list.fetch',
    { recordResponse: true },
    async () => {
      try {
        // 1. Guard / Permissions
        // Throws if invalid
        const accessConfig = ensureClaimsAccess(session);

        Sentry.setTag('tenantId', accessConfig.tenantId);
        Sentry.setTag('role', accessConfig.role);
        if (accessConfig.branchId) Sentry.setTag('branchId', accessConfig.branchId);

        const filters: ClaimsListV2Filters = {
          ...accessConfig,
          ...params,
        };

        // 2. Query
        const { rows, facets } = await getClaimsListQuery(filters);

        // 3. Map
        const dto = mapClaimsToDto(rows, facets, params.page || 1, params.perPage || 20);

        return dto;
      } catch (error) {
        // Capture specific domain errors
        Sentry.captureException(error, {
          tags: { domain: 'claims', action: 'getClaimsListV2' },
        });
        throw error; // Re-throw for UI error boundary
      }
    }
  );
}
