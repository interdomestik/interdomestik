/** Shared request shapes, context literals and mount/redirect helpers for login entry tests. */
export type MockTenantContext =
  | { kind: 'tenant'; tenantId: string; source: string }
  | { kind: 'public'; tenantId: null; source: string };

export type MockSession = { user?: { role?: string } } | null;

export type LoginPageSearchParams = {
  tenantId?: string | string[];
  plan?: string | string[];
  next?: string | string[];
};

export type LoginPageComponent = (props: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<LoginPageSearchParams>;
}) => Promise<unknown>;

export type BootstrapRedirectArgs = Parameters<
  (typeof import('./_core'))['getLoginTenantBootstrapRedirect']
>[0];

type MountArgs = { locale?: string; searchParams?: LoginPageSearchParams };

/** A front-door request — including one carrying a stale tenant cookie — resolves to this. */
export const PUBLIC_FRONT_DOOR_CONTEXT: MockTenantContext = {
  kind: 'public',
  tenantId: null,
  source: 'ida_front_door',
};

export const COUNTRY_ALIAS_CONTEXT: MockTenantContext = {
  kind: 'tenant',
  tenantId: 'tenant_ks',
  source: 'compatibility_alias',
};

/**
 * A host that exact neutral admission never admits, so a suite that mocks the tenant resolver keeps
 * asserting its own resolved context rather than the neutral override.
 */
export const NON_NEUTRAL_REQUEST_HOST = 'localhost:3000';

const CONFIGURED_HOST_ENV_KEYS = [
  'IDA_HOST',
  'VERCEL_URL',
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'DEFAULT_PUBLIC_TENANT_ID',
] as const;

const NEUTRAL_HOST_ENV_KEYS = ['NODE_ENV', 'VERCEL_ENV', ...CONFIGURED_HOST_ENV_KEYS] as const;

const MUTABLE_ENV = process.env as Record<string, string | undefined>;

export function snapshotNeutralHostEnv(into: Map<string, string | undefined>): void {
  for (const key of NEUTRAL_HOST_ENV_KEYS) into.set(key, MUTABLE_ENV[key]);
}

export function restoreNeutralHostEnv(from: Map<string, string | undefined>): void {
  for (const key of NEUTRAL_HOST_ENV_KEYS) {
    const value = from.get(key);
    if (value === undefined) {
      delete MUTABLE_ENV[key];
    } else {
      MUTABLE_ENV[key] = value;
    }
  }
}

/** Removes any ambient configured-host or default-tenant override from the decision under test. */
export function clearNeutralHostOverrides(): void {
  for (const key of CONFIGURED_HOST_ENV_KEYS) delete MUTABLE_ENV[key];
}

/** A production build with no configured neutral-host override: the canonical hosts stand alone. */
export function setProductionNeutralHostEnv(): void {
  clearNeutralHostOverrides();
  MUTABLE_ENV.NODE_ENV = 'production';
  delete MUTABLE_ENV.VERCEL_ENV;
}

/** A non-production build, where the shared resolver still honours cookie/header/query hints. */
export function setDevelopmentNeutralHostEnv(): void {
  clearNeutralHostOverrides();
  MUTABLE_ENV.NODE_ENV = 'development';
  delete MUTABLE_ENV.VERCEL_ENV;
}

/** Stands in for `next/navigation`'s redirect, which throws to stop rendering. */
export function throwNextRedirect(target: string): never {
  throw Object.assign(new Error(`NEXT_REDIRECT:${target}`), { redirectTarget: target });
}

export function renderLoginPage(
  page: LoginPageComponent,
  args: MountArgs
): Promise<React.ReactElement> {
  return page({
    params: Promise.resolve({ locale: args.locale ?? 'en' }),
    searchParams: Promise.resolve(args.searchParams ?? {}),
  }) as Promise<React.ReactElement>;
}

export async function captureRedirect(
  page: LoginPageComponent,
  args: MountArgs
): Promise<string | null> {
  try {
    await renderLoginPage(page, args);
    return null;
  } catch (error) {
    return (error as { redirectTarget?: string }).redirectTarget ?? null;
  }
}
