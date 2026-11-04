// v2.0.0-ops — Admin Claims lifecycle hardening
import * as Sentry from '@sentry/nextjs';
import 'server-only';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { UnauthorizedError } from '@interdomestik/shared-auth';
import { ensureClaimsAccess, type ClaimsSession } from './guards';
import { getTenantSafeClaimsListQuery } from './list-query';
import { mapClaimsToDto } from './mappers';
import type { ClaimsListV2Dto, ClaimsListV2Filters } from './types';

/** A session and the tenant authority minted from it, as authorizeSessionTenant returns them. */
type ClaimsListAuthorization = Readonly<{ session: ClaimsSession; authority: TenantAuthority }>;

export async function getClaimsListV2(
  authorized: ClaimsListAuthorization | null,
  params: Omit<ClaimsListV2Filters, 'tenantId' | 'role' | 'branchId' | 'userId'>
): Promise<ClaimsListV2Dto> {
  return Sentry.withServerActionInstrumentation(
    'claims.list.fetch',
    { recordResponse: true },
    async () => {
      try {
        // 1. Guard / Permissions
        // Scope and the transaction's authority come from the same authenticated session.
        if (!authorized) throw new UnauthorizedError();
        const accessConfig = ensureClaimsAccess(authorized.session);

        Sentry.setTag('tenantId', accessConfig.tenantId);
        Sentry.setTag('role', accessConfig.role);
        if (accessConfig.branchId) Sentry.setTag('branchId', accessConfig.branchId);

        const filters: ClaimsListV2Filters = {
          ...accessConfig,
          ...params,
        };

        // 2. Query
        const { rows, facets } = await getTenantSafeClaimsListQuery(
          authorized.authority,
          filters,
          accessConfig.tenantId
        );

        // 3. Map
        const dto = mapClaimsToDto(
          rows,
          facets,
          params.page || 1,
          params.perPage || 20,
          accessConfig.role,
          params.statusFilter
        );

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
