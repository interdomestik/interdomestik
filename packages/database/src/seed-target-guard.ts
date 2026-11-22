import { bindSeedTarget } from './seed-target-binding';
import {
  classifySeedTarget,
  refuse,
  requireDisposableTargetClass,
  type DisposableTargetClassification,
  type SeedEnvironment,
  type SeedTargetClassification,
} from './seed-target-classification';
import {
  closeSeedTlsClients,
  hasInstalledSeedTlsClients,
  installSeedTlsClients,
} from './seed-target-tls';
export { resetSeedTargetBindingForTests } from './seed-target-binding';
import { DEFAULT_E2E_PASSWORD, E2E_PASSWORD } from './e2e-users';

function assertRemoteSeedPassword(env: SeedEnvironment, effectivePassword: string): void {
  if (
    !effectivePassword ||
    effectivePassword === DEFAULT_E2E_PASSWORD ||
    effectivePassword.length < 20 ||
    env.E2E_PASSWORD?.trim() !== effectivePassword
  ) {
    refuse('non-local-password');
  }
  // Require three of lowercase, uppercase, digit and non-whitespace symbol.
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d\s]/];
  if (classes.filter(pattern => pattern.test(effectivePassword)).length < 3) {
    refuse('non-local-password');
  }
}

/** Process-bound preflight; refusals expose only a classification, never credentials. */
export function assertSeedTargetAllowed(
  env: SeedEnvironment,
  effectivePassword: string = E2E_PASSWORD
): SeedTargetClassification {
  const { expected, classification } = classifySeedTarget(env, env.NODE_ENV);
  const remote = classification === 'confirmed-non-local';
  if (remote) assertRemoteSeedPassword(env, effectivePassword);
  bindSeedTarget(env, expected, remote);
  return classification;
}

export type { DisposableTargetClassification } from './seed-target-classification';
export { readDisposableTargetClass } from './seed-target-classification';

/** R-13 seed preflight keeps the production environment refusal. */
export function assertDisposableTarget(env: SeedEnvironment): DisposableTargetClassification {
  return requireDisposableTargetClass(env, env.NODE_ENV);
}

/** full/workload hash fixed public fixture passwords, so they never run on a non-local target. */
export function assertSeedModeAllowed(
  mode: string,
  classification: SeedTargetClassification
): void {
  if (classification !== 'local' && mode !== 'e2e' && mode !== 'golden') {
    refuse('non-local-mode');
  }
}

/** Validate both sides of module evaluation, before returning any database capability. */
export async function importSeedDatabase(): Promise<typeof import('./db')> {
  try {
    if (
      assertSeedTargetAllowed(process.env) === 'confirmed-non-local' &&
      !hasInstalledSeedTlsClients()
    ) {
      installSeedTlsClients(process.env);
    }
    const database = await import('./db');
    assertSeedTargetAllowed(process.env);
    return database;
  } catch (error) {
    await closeSeedTlsClients();
    throw error;
  }
}

/** Command entry points own cleanup; reusable golden/full/workload/packs share their lifetime. */
export async function closeSeedTargetClients(): Promise<void> {
  await closeSeedTlsClients();
}

/** Report an uncaught failure, close the clients this process installed, then exit. */
export async function exitSeed(code: number, failure?: unknown): Promise<never> {
  if (failure !== undefined) console.error('Seed failed:', failure);
  await closeSeedTlsClients();
  process.exit(code);
}
