import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  isTenantAuthority,
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

/**
 * Stand-in for the verified-delivery capability that `verifyPaddleWebhook` mints. Unit tests that
 * mock `authorizePaddleTenant` never present it to the real producer, so an opaque frozen token is
 * enough; tests assert that exactly this value reaches the producer.
 */
export const TEST_PADDLE_DELIVERY = Object.freeze({}) as IngressCapability<'paddle-delivery'>;

/**
 * Behaviour for a mocked `authorizePaddleTenant`: a test authority for the tenant of the owner the
 * resolver returned. Tests assert the mock was called with `TEST_PADDLE_DELIVERY` and the exact
 * owner object, and that `withTenantContext` received the authority it returned.
 */
export function authorizeTestPaddleOwner(
  _delivery: unknown,
  owner: { tenantId: string }
): TenantAuthority {
  return mintTestTenantAuthority(owner.tenantId);
}

/**
 * Emulates `authorizePaddleBillingTenant` for a delivery bound to `boundBillingTenantId` (null for
 * an unbound, legacy-secret delivery): it succeeds only for the bound billing tenant.
 */
export function createTestPaddleBillingProducer(boundBillingTenantId: string | null) {
  return (_delivery: unknown, tenantId: string): TenantAuthority => {
    if (!boundBillingTenantId) {
      throw new Error('Paddle billing authority requires an entity-bound delivery');
    }
    if (tenantId.trim() !== boundBillingTenantId) {
      throw new Error('Paddle billing authority requires the delivery billing tenant');
    }
    return mintTestTenantAuthority(boundBillingTenantId);
  };
}

/** Permissive stand-in for tests that are not about the binding: any tenant gets an authority. */
export function authorizeAnyTestPaddleBillingTenant(
  _delivery: unknown,
  tenantId: string
): TenantAuthority {
  return mintTestTenantAuthority(tenantId);
}

/** Asymmetric matcher: a tenant authority for exactly this tenant (tokens are opaque to deep-equal). */
export function authorityForTenant(tenantId: string) {
  return {
    asymmetricMatch: (value: unknown) =>
      isTenantAuthority(value) && readTenantAuthority(value).tenantId === tenantId,
    toString: () => `TenantAuthority(${tenantId})`,
    toAsymmetricMatcher: () => `TenantAuthority(${tenantId})`,
  };
}
