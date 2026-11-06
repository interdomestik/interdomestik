import { buildCashStateUsersToSeed } from './cash-states';
import { buildLifecycleUsersToSeed } from './lifecycle-memberships';
import type { SeedGoldenContext } from './types';

/** The dedicated identities of the named Plan070 states, seeded with the golden users. */
export function buildStateUsersToSeed({ at }: Pick<SeedGoldenContext, 'at'>) {
  return [...buildLifecycleUsersToSeed({ at }), ...buildCashStateUsersToSeed({ at })];
}
