import { isTenantAuthority, readTenantAuthority, type TenantAuthority } from './tenant-authority';

/**
 * Legacy caller-supplied context. Accepted only where the calling code is unchanged from the
 * reviewed tree; new and changed code passes a TenantAuthority from a fixed producer.
 */
export type TenantContext = {
  tenantId: string;
  accessTenantId?: string | null;
  role?: string | null;
};

export type ResolvedTenantContext = {
  tenantId: string;
  accessTenantId: string;
  role: string | null;
};

function requireTenantId(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`withTenantContext requires a non-empty ${label}`);
  return normalized;
}

/** Every authority-bearing field comes from one source: the authority descriptor, or the legacy context. */
export function resolveTenantContext(
  context: TenantAuthority | TenantContext
): ResolvedTenantContext {
  if (isTenantAuthority(context)) {
    const descriptor = readTenantAuthority(context);
    return {
      tenantId: descriptor.tenantId,
      accessTenantId: descriptor.accessTenantId,
      role: descriptor.principal?.role ?? null,
    };
  }
  const legacy = context as Partial<TenantContext> | null;
  const tenantId = requireTenantId(legacy?.tenantId, 'tenantId');
  const accessTenantId =
    typeof legacy?.accessTenantId === 'string' && legacy.accessTenantId.trim()
      ? legacy.accessTenantId.trim()
      : tenantId;
  return { tenantId, accessTenantId, role: legacy?.role ?? null };
}
