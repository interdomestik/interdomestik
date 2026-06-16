import { coerceTenantId, type TenantId } from './tenant-hosts';

export type TenantSessionLike = {
  user?: {
    accessTenantId?: string | null;
    bookingTenantId?: string | null;
    legalTenantId?: string | null;
    tenantId?: string | null;
  } | null;
} | null;

export type SessionTenantConcepts = {
  accessTenantId: TenantId | null;
  bookingTenantId: TenantId | null;
  legalTenantId: TenantId | null;
};

export function resolveSessionTenantConcepts(session: TenantSessionLike): SessionTenantConcepts {
  const accessTenantId =
    coerceTenantId(session?.user?.accessTenantId) ?? coerceTenantId(session?.user?.tenantId);

  if (!accessTenantId) {
    return {
      accessTenantId: null,
      bookingTenantId: null,
      legalTenantId: null,
    };
  }

  return {
    accessTenantId,
    bookingTenantId: coerceTenantId(session?.user?.bookingTenantId) ?? accessTenantId,
    legalTenantId: coerceTenantId(session?.user?.legalTenantId) ?? accessTenantId,
  };
}
