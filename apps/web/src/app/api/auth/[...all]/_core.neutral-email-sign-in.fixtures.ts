/**
 * Shared request shapes and environment control for the neutral single-entry sign-in suites.
 *
 * Deliberately free of test-runner imports: each suite registers its own lifecycle hooks and its
 * own account-lookup spy, so these fixtures stay plain data and env helpers.
 */
export const SIGN_IN_URL = 'https://www.interdomestik.com/api/auth/sign-in/email';
export const MEMBER_EMAIL = 'member.mk@interdomestik.test';
export const CREDENTIALS = { email: MEMBER_EMAIL, password: 'not-used-in-unit-test' };

/** Present in every explicit-context case: a stale cookie must never influence the decision. */
export const STALE_TENANT_COOKIE = 'tenantId=tenant_al; better-auth.session_token=stale';
/** Matches the account tenant, so a legacy fall-through would authenticate the request. */
export const MATCHING_TENANT_COOKIE = 'tenantId=tenant_mk';

export type AccountTenantId = 'tenant_ks' | 'tenant_mk' | 'tenant_al' | 'pilot-mk';

export const MUTABLE_ENV = process.env as Record<string, string | undefined>;

// Host admission and the default public tenant must not inherit ambient configuration.
const CLEARED_ENV_KEYS = [
  'IDA_HOST',
  'VERCEL_URL',
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'DEFAULT_PUBLIC_TENANT_ID',
] as const;

const MANAGED_ENV_KEYS = [
  'NODE_ENV',
  'VERCEL_ENV',
  'FEATURE_IDA_LIVE_LOGIN_CUTOVER',
  ...CLEARED_ENV_KEYS,
] as const;

export function snapshotManagedEnv(into: Map<string, string | undefined>): void {
  for (const key of MANAGED_ENV_KEYS) into.set(key, MUTABLE_ENV[key]);
}

export function restoreManagedEnv(from: Map<string, string | undefined>): void {
  for (const key of MANAGED_ENV_KEYS) {
    const value = from.get(key);
    if (value === undefined) {
      delete MUTABLE_ENV[key];
    } else {
      MUTABLE_ENV[key] = value;
    }
  }
}

export function clearAmbientEnv(): void {
  for (const key of CLEARED_ENV_KEYS) delete MUTABLE_ENV[key];
}

export function setProductionBuildEnv(): void {
  MUTABLE_ENV.NODE_ENV = 'production';
  delete MUTABLE_ENV.VERCEL_ENV;
}

export const ADMITTED_NEUTRAL_HOSTS = [
  'interdomestik.com',
  'www.interdomestik.com',
  'app.interdomestik.com',
  'staging.interdomestik.com',
  'interdomestik-web.vercel.app',
  'ida.interdomestik.com',
  'ida.localhost:3000',
] as const;

export const EXPLICIT_CONTEXT_SHAPES = [
  { shape: 'header hint', headers: { 'x-tenant-id': 'tenant_mk' }, body: CREDENTIALS },
  {
    shape: 'body tenantId hint',
    headers: {},
    body: { ...CREDENTIALS, additionalData: { tenantId: 'tenant_mk' } },
  },
  {
    shape: 'validated booking hint',
    headers: {},
    body: { ...CREDENTIALS, additionalData: { default_booking_tenant_id: 'tenant_mk' } },
  },
] as const;

/** Every newly admitted neutral host crossed with every explicit-context shape. */
export const EXPLICIT_CONTEXT_CASES = ADMITTED_NEUTRAL_HOSTS.flatMap(host =>
  EXPLICIT_CONTEXT_SHAPES.map(shape => ({ host, ...shape }))
);

export const WRONG_TENANT_CONTEXT_DENIAL = {
  decision: 'deny',
  code: 'WRONG_TENANT_CONTEXT',
  message: 'Wrong tenant context',
} as const;

export const MISSING_CONTEXT_DENIAL = {
  ...WRONG_TENANT_CONTEXT_DENIAL,
  reason: 'missing_tenant_context',
  resolvedTenantId: null,
} as const;

export function tenantMismatchDenial(resolvedTenantId: AccountTenantId) {
  return { ...WRONG_TENANT_CONTEXT_DENIAL, reason: 'tenant_mismatch', resolvedTenantId } as const;
}
