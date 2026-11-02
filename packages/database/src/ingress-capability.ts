import { createHash, timingSafeEqual } from 'node:crypto';

// Proof that a request entered through an authenticated non-session ingress. System producers mint
// tenant authorities only on presentation of the matching capability, so "who may act for a
// tenant" is decided by an authenticated entry, not by which file happens to call a producer.
// Like TenantAuthority, a capability is an opaque frozen token described only in this module.

export type IngressKind = 'cron' | 'inngest' | 'paddle-delivery';

declare const INGRESS: unique symbol;

export type IngressCapability<K extends IngressKind = IngressKind> = Readonly<{ [INGRESS]: K }>;

// A Paddle delivery verified on an entity route is bound to that entity's billing tenant: the
// verifier chose the secret from the fixed entity configuration, so only that Paddle account can
// have signed it. Deliveries verified with the unbound legacy secret carry no billing tenant.
export type IngressBinding = Readonly<{ billingTenantId?: string }>;

type IngressDescriptor = Readonly<{
  kind: IngressKind;
  expiresAtMs: number;
  billingTenantId: string | null;
}>;

const LIFETIME_MS: Record<IngressKind, number> = {
  cron: 60 * 60_000,
  inngest: 60 * 60_000,
  'paddle-delivery': 10 * 60_000,
};

const capabilities = new WeakMap<object, IngressDescriptor>();

/** Internal. Exposed outside packages/database only for the Inngest middleware and Paddle verifier. */
export function mintIngressCapability<K extends IngressKind>(
  kind: K,
  nowMs = Date.now(),
  binding: IngressBinding = {}
): IngressCapability<K> {
  if (!(kind in LIFETIME_MS)) throw new Error('Ingress capability requires a known kind');
  const billingTenantId = binding.billingTenantId?.trim() || null;
  if (billingTenantId && kind !== 'paddle-delivery') {
    throw new Error('Only a Paddle delivery can be bound to a billing tenant');
  }
  const token = Object.freeze(Object.create(null)) as IngressCapability<K>;
  capabilities.set(
    token,
    Object.freeze({ kind, expiresAtMs: nowMs + LIFETIME_MS[kind], billingTenantId })
  );
  return token;
}

/** Fails closed unless the value is a registered, unexpired capability of one of the given kinds. */
export function requireIngressCapability(
  capability: unknown,
  kinds: readonly IngressKind[],
  nowMs = Date.now()
): IngressKind {
  const descriptor =
    typeof capability === 'object' && capability !== null
      ? capabilities.get(capability)
      : undefined;
  if (!descriptor || !kinds.includes(descriptor.kind)) {
    throw new Error('Unrecognized ingress capability');
  }
  if (nowMs >= descriptor.expiresAtMs) throw new Error('Expired ingress capability');
  return descriptor.kind;
}

/** The billing tenant a verified Paddle delivery is bound to, or null for an unbound delivery. */
export function requirePaddleDeliveryBillingTenant(
  delivery: unknown,
  nowMs = Date.now()
): string | null {
  requireIngressCapability(delivery, ['paddle-delivery'], nowMs);
  return capabilities.get(delivery as object)!.billingTenantId;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Admits a scheduled request carrying `Authorization: Bearer <CRON_SECRET>`. The secret is read
 * here from the environment, never from the caller, and compared in constant time.
 */
export function admitCronRequest(
  authorizationHeader: string | null | undefined
): IngressCapability<'cron'> | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || typeof authorizationHeader !== 'string') return null;
  const matches = timingSafeEqual(digest(authorizationHeader), digest(`Bearer ${secret}`));
  return matches ? mintIngressCapability('cron') : null;
}
