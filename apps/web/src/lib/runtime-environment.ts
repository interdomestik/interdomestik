export function isAutomatedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'test' ||
    env.CI === 'true' ||
    env.PLAYWRIGHT === '1' ||
    env.INTERDOMESTIK_AUTOMATED === '1'
  );
}

export function isProductionDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.INTERDOMESTIK_PRODUCTION === '1' ||
    env.VERCEL_ENV === 'production' ||
    env.NODE_ENV === 'production'
  );
}

export function isLocalE2ERuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.INTERDOMESTIK_LOCAL_E2E === '1' &&
    env.PLAYWRIGHT === '1' &&
    env.INTERDOMESTIK_PRODUCTION !== '1' &&
    env.VERCEL_ENV !== 'production'
  );
}

export function isE2EDiagnosticsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isLocalE2ERuntime(env) && env.INTERDOMESTIK_E2E_DIAGNOSTICS === '1';
}

export function isBillingTestActivationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env) && !isLocalE2ERuntime(env)) return false;

  return (
    env.NEXT_PUBLIC_BILLING_TEST_MODE === '1' &&
    env.BILLING_TEST_MODE === '1' &&
    (env.NODE_ENV !== 'production' || isLocalE2ERuntime(env))
  );
}
