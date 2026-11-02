// Tenant authority is a capability, not a value: an opaque frozen token whose tenant, access
// tenant, purpose and principal live only in this module's private WeakMap. A token cannot be
// built by a caller, copied into a different tenant, or mutated after minting; withTenantContext
// reads every authority-bearing field from the descriptor. Minting is confined to the fixed
// producers that authenticate their own ingress (the request session, a verified Paddle delivery,
// the cron secret, a public token hash, the seed CLI); see tenant-authority-registrar.ts.

export type TenantAuthorityPurpose =
  | 'session'
  | 'scheduled-work'
  | 'paddle-webhook'
  | 'public-token'
  | 'platform-aggregate'
  | 'seed'
  | 'test';

export type TenantAuthorityPrincipal = Readonly<{
  userId: string;
  role: string | null;
  branchId: string | null;
  agentId: string | null;
}>;

export type TenantAuthorityDescriptor = Readonly<{
  tenantId: string;
  accessTenantId: string;
  purpose: TenantAuthorityPurpose;
  principal: TenantAuthorityPrincipal | null;
  expiresAtMs: number;
}>;

declare const TENANT_AUTHORITY: unique symbol;

/** Opaque tenant capability. Only the descriptor registry gives it meaning. */
export type TenantAuthority = Readonly<{ [TENANT_AUTHORITY]: true }>;

export type TenantAuthorityGrant = {
  tenantId: string;
  accessTenantId?: string | null;
  purpose: TenantAuthorityPurpose;
  principal?: TenantAuthorityPrincipal | null;
};

// Bounded lifetimes stop a token from being retained past the request, run or delivery it was
// minted for. Expiry fails closed at use.
const LIFETIME_MS: Record<TenantAuthorityPurpose, number> = {
  session: 10 * 60_000,
  'scheduled-work': 60 * 60_000,
  'paddle-webhook': 10 * 60_000,
  'public-token': 10 * 60_000,
  'platform-aggregate': 10 * 60_000,
  seed: 60 * 60_000,
  test: 60 * 60_000,
};

const descriptors = new WeakMap<object, TenantAuthorityDescriptor>();

function requireIdentifier(value: string | null | undefined, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`Tenant authority requires a non-empty ${label}`);
  return normalized;
}

function freezePrincipal(
  principal: TenantAuthorityPrincipal | null | undefined
): TenantAuthorityPrincipal | null {
  if (!principal) return null;
  return Object.freeze({
    userId: requireIdentifier(principal.userId, 'principal userId'),
    role: principal.role?.trim() || null,
    branchId: principal.branchId?.trim() || null,
    agentId: principal.agentId?.trim() || null,
  });
}

/**
 * Registers a new authority. Internal: reachable only through the registrar module, whose callers
 * are the fixed producers.
 */
export function mintTenantAuthority(
  grant: TenantAuthorityGrant,
  nowMs = Date.now()
): TenantAuthority {
  const tenantId = requireIdentifier(grant.tenantId, 'tenantId');
  const accessTenantId = grant.accessTenantId?.trim() || tenantId;
  if (!(grant.purpose in LIFETIME_MS)) throw new Error('Tenant authority requires a known purpose');
  const token = Object.freeze(Object.create(null)) as TenantAuthority;
  descriptors.set(
    token,
    Object.freeze({
      tenantId,
      accessTenantId,
      purpose: grant.purpose,
      principal: freezePrincipal(grant.principal),
      expiresAtMs: nowMs + LIFETIME_MS[grant.purpose],
    })
  );
  return token;
}

export function isTenantAuthority(value: unknown): value is TenantAuthority {
  return typeof value === 'object' && value !== null && descriptors.has(value);
}

/** Reads a registered, unexpired authority. Anything else fails closed. */
export function readTenantAuthority(
  authority: TenantAuthority,
  nowMs = Date.now()
): TenantAuthorityDescriptor {
  const descriptor =
    typeof authority === 'object' && authority !== null ? descriptors.get(authority) : undefined;
  if (!descriptor) throw new Error('Unrecognized tenant authority');
  if (nowMs >= descriptor.expiresAtMs) throw new Error('Expired tenant authority');
  return descriptor;
}
