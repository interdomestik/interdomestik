import { readDisposableTargetClass } from '@interdomestik/database/seed-target-classification';
import { hostedAuthEnvironmentOf, isHostedDeployment } from './auth/deployment-hosts';

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

export function isLocalE2ERuntime(env: Readonly<NodeJS.Dict<string>> = process.env): boolean {
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

export function hasPositiveProductionSignal(
  env: Readonly<NodeJS.Dict<string>> = process.env
): boolean {
  return (
    env.VERCEL_ENV?.trim().toLowerCase() === 'production' ||
    env.VERCEL_TARGET_ENV?.trim().toLowerCase() === 'production' ||
    env.INTERDOMESTIK_PRODUCTION === '1' ||
    env.INTERDOMESTIK_DEPLOY_ENV?.trim().toLowerCase() === 'production'
  );
}

export function releaseClass(
  env: Readonly<NodeJS.Dict<string>> = process.env
): 'local-e2e' | 'development' | 'staging' | 'production' {
  if (hasPositiveProductionSignal(env)) return 'production';

  const target = env.INTERDOMESTIK_DEPLOY_ENV;
  if (isHostedDeployment(env)) {
    return hostedAuthEnvironmentOf(env) === 'staging' &&
      (target === undefined || target === 'staging' || target === 'preview')
      ? 'staging'
      : 'production';
  }

  if (!readDisposableTargetClass(env)) return 'production';
  if (isLocalE2ERuntime(env) && (target === undefined || target === 'development')) {
    return 'local-e2e';
  }
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return 'development';
  return 'production';
}
