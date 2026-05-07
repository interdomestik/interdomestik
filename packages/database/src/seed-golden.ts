import type { SeedConfig } from './seed-types';
import { seedGolden as runSeedGolden } from './seed-golden/index';

export { buildSeededMembershipCardIdentifiers } from './seed-golden/membership-cards';

export async function seedGolden(config: SeedConfig) {
  return runSeedGolden(config);
}
