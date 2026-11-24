import type { SeedMode } from './seed-types';
import { SEED_VERSION } from './seed-version';

export interface SeedReceipt {
  version: string;
  mode: SeedMode;
  gitSha: string | null;
  seedBaseTime: Date;
  runAt: Date;
  runBy: string;
}

/**
 * Build seed receipt for logging
 */
export function buildReceipt(
  mode: SeedMode,
  seedBaseTime: Date,
  gitSha: string | null
): SeedReceipt {
  const runAt = new Date();
  let runBy = 'local';
  if (process.env.CI) {
    runBy = 'ci';
  }
  return {
    version: SEED_VERSION,
    mode,
    gitSha,
    seedBaseTime,
    runAt,
    runBy,
  };
}

/**
 * Log seed receipt to console
 */
export function logReceipt(receipt: SeedReceipt): void {
  console.log('\n📋 ═══════════════════════════════════════════');
  console.log('   SEED RECEIPT');
  console.log('═══════════════════════════════════════════════');
  console.log(`   VERSION:    ${receipt.version}`);
  console.log(`   MODE:       ${receipt.mode}`);
  console.log(`   GIT SHA:    ${receipt.gitSha || 'N/A'}`);
  console.log(`   BASE TIME:  ${receipt.seedBaseTime.toISOString()}`);
  console.log(`   RUN AT:     ${receipt.runAt.toISOString()}`);
  console.log(`   RUN BY:     ${receipt.runBy}`);
  console.log('═══════════════════════════════════════════════\n');
}
