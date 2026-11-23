import type { SeedConfig } from './seed-types';

type Seeder = (config: SeedConfig) => Promise<void>;

interface SeedModeTasks {
  seedAgentPack: Seeder;
  seedFull: Seeder;
  seedGolden: Seeder;
  seedKsWorkflowPack: Seeder;
  seedWorkload: Seeder;
}

interface LegalAcceptanceSeedTasks {
  clean: () => Promise<unknown>;
  seed: () => Promise<unknown>;
}

export async function runSeedMode(
  config: SeedConfig,
  tasks: SeedModeTasks,
  legalAcceptance?: LegalAcceptanceSeedTasks
) {
  if (legalAcceptance) await legalAcceptance.clean();

  switch (config.mode) {
    case 'e2e':
      console.log('🚀 Mode: E2E (Baseline + KS Pack + Agent Pack)');
      await tasks.seedGolden(config);
      await tasks.seedKsWorkflowPack(config);
      await tasks.seedAgentPack(config);
      break;

    case 'golden':
      console.log('🏆 Mode: Golden (Baseline Only)');
      await tasks.seedGolden(config);
      break;

    case 'full':
      console.log('🌍 Mode: Full (Full System Seed)');
      await tasks.seedFull(config);
      break;

    case 'workload':
      console.log('🏋️ Mode: Workload (Golden + Workload Overlay)');
      await tasks.seedGolden(config);
      await tasks.seedWorkload(config);
      break;
  }

  if (legalAcceptance) await legalAcceptance.seed();
}
