import {
  requireIngressCapability,
  requirePaddleDeliveryBillingTenant,
  type IngressCapability,
} from './ingress-capability';
import { mintTenantAuthority, type TenantAuthority } from './tenant-authority';

// The Paddle webhook producer. A tenant authority for webhook processing needs two proofs: the
// delivery capability (minted only after the Paddle signature verified) and an owner record that
// one of this package's fixed provider-reference resolvers returned. A caller-built
// `{ tenantId }`, or customData naming a tenant, can never become a Paddle authority.

export type ResolvedPaddleOwner = Readonly<{ tenantId: string }>;

const resolvedOwners = new WeakSet<object>();

/** Internal to the resolvers: freezes an owner row and records that a resolver produced it. */
export function registerResolvedPaddleOwner<T extends { tenantId: string }>(owner: T): Readonly<T> {
  const frozen = Object.freeze({ ...owner });
  resolvedOwners.add(frozen);
  return frozen;
}

export function authorizePaddleTenant(
  delivery: IngressCapability<'paddle-delivery'>,
  owner: ResolvedPaddleOwner
): TenantAuthority {
  requireIngressCapability(delivery, ['paddle-delivery']);
  if (typeof owner !== 'object' || owner === null || !resolvedOwners.has(owner)) {
    throw new Error('Paddle tenant authority requires a resolver-produced owner');
  }
  return mintTenantAuthority({ tenantId: owner.tenantId, purpose: 'paddle-webhook' });
}

/**
 * Billing-scope authority for effects whose tenant is the billing entity's legal tenant rather than
 * a resolved owner row: checkout-user reconciliation and invoice/ledger invariants. The delivery
 * must have been verified on an entity route, and the requested tenant must be the billing tenant
 * that route bound. An unbound (legacy-secret) delivery, or any other tenant, fails closed.
 */
export function authorizePaddleBillingTenant(
  delivery: IngressCapability<'paddle-delivery'>,
  tenantId: string
): TenantAuthority {
  const billingTenantId = requirePaddleDeliveryBillingTenant(delivery);
  if (!billingTenantId) {
    throw new Error('Paddle billing authority requires an entity-bound delivery');
  }
  if (typeof tenantId !== 'string' || tenantId.trim() !== billingTenantId) {
    throw new Error('Paddle billing authority requires the delivery billing tenant');
  }
  return mintTenantAuthority({ tenantId: billingTenantId, purpose: 'paddle-billing' });
}
