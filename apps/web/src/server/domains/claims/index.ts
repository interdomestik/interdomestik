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

        // LEAK SENTINEL: Confirm result purity (Dev/Stage/Test check)
        // In production this might be expensive if many rows, but critical for multi-tenant safety.
        if (rows.length > 0) {
          const leakingRow = rows.find(r => r.tenantId !== accessConfig.tenantId);
          if (leakingRow) {
            console.error('🚨 TENANT LEAK DETECTED', {
              userTenant: accessConfig.tenantId,
              leakedRowId: leakingRow.id,
              leakedRowTenant: leakingRow.tenantId,
            });
            throw new Error(
              `CRITICAL: Tenant Data Leak Detected! User ${accessConfig.tenantId} saw data from ${leakingRow.tenantId}`
            );
          }
        }

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
