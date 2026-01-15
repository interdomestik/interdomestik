import { execSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedFull } from './seed-full';
import { seedGolden } from './seed-golden';
import { seedAgentPack } from './seed-packs/agent-pack';
import { seedKsWorkflowPack } from './seed-packs/ks-workflow-pack';
import { createSeedConfig, type SeedMode } from './seed-types';
import { SEED_VERSION } from './seed-version';
import { seedWorkload } from './seed-workload';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFromRoot() {
  const rootDir = path.resolve(__dirname, '../../..');
  const envFiles = ['.env', '.env.local'];

  for (const file of envFiles) {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      loadEnv({ path: filePath });
    }
  }

  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL not found in environment variables. DB connection might fail.');
  }
}

// Force load .env
loadEnvFromRoot();

/**
 * Deterministic base time for seeding (ensures reproducible timestamps)
 */
const E2E_SEED_BASE_TIME = new Date('2026-01-01T00:00:00Z');

interface SeedReceipt {
  version: string;
  mode: SeedMode;
  gitSha: string | null;
  seedBaseTime: Date;
  runAt: Date;
  runBy: string;
}

/**
 * Get current git SHA (short) if available
 */
function getGitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Build seed receipt for logging
 */
function buildReceipt(mode: SeedMode, seedBaseTime: Date): SeedReceipt {
  return {
    version: SEED_VERSION,
    mode,
    gitSha: getGitSha(),
    seedBaseTime,
    runAt: new Date(),
    runBy: process.env.CI ? `ci-${process.env.CI_JOB_ID || 'unknown'}` : 'local',
  };
}

/**
 * Log seed receipt to console
 */
function logReceipt(receipt: SeedReceipt): void {
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

/**
 * Check existing seed meta and determine if reset is needed
 */
async function checkSeedMeta(
  db: any,
  mode: SeedMode,
  forceReset: boolean
): Promise<{ action: 'seed' | 'skip' | 'block'; reason: string }> {
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const allowReset = process.env.SEED_ALLOW_RESET === 'true';

  const existingMeta = await readSeedMeta(db);
  if (existingMeta) {
    if (mode === 'e2e') {
      if (isProduction && !allowReset) {
        return {
          action: 'block',
          reason: 'E2E reset refused in production without SEED_ALLOW_RESET=true.',
        };
      }
      if (existingMeta.version !== SEED_VERSION) {
        return {
          action: 'seed',
          reason: `Version mismatch: ${existingMeta.version} -> ${SEED_VERSION}`,
        };
      }
      return { action: 'seed', reason: 'E2E mode always reseeds' };
    }

    if (!forceReset) {
      return {
        action: 'skip',
        reason: `Data exists (v${existingMeta.version}). Use --reset to overwrite.`,
      };
    }

    return { action: 'seed', reason: '--reset flag provided' };
  }

  const hasData = await hasExistingData(db);
  if (hasData) {
    if (mode === 'e2e') {
      if (isProduction && !allowReset) {
        return {
          action: 'block',
          reason: 'E2E reset refused in production without SEED_ALLOW_RESET=true.',
        };
      }
      return {
        action: 'seed',
        reason: 'seed_meta missing but data exists; E2E reset permitted.',
      };
    }

    if (!forceReset) {
      return {
        action: 'block',
        reason: 'seed_meta missing but data exists. Use --reset to overwrite.',
      };
    }

    return {
      action: 'seed',
      reason: 'seed_meta missing but data exists; --reset flag provided.',
    };
  }

  return { action: 'seed', reason: 'Fresh seed (seed_meta missing, no data found).' };
}

async function readSeedMeta(db: any): Promise<any | null> {
  try {
    return await db.query.seedMeta.findFirst();
  } catch {
    return null;
  }
}

async function hasExistingData(db: any): Promise<boolean> {
  try {
    const user = await db.query.user.findFirst({ columns: { id: true } });
    if (user) return true;
    const tenant = await db.query.tenants.findFirst({ columns: { id: true } });
    return Boolean(tenant);
  } catch {
    return false;
  }
}

/**
 * Write seed meta to database
 */
async function writeSeedMeta(db: any, schema: any, receipt: SeedReceipt): Promise<void> {
  try {
    // Upsert (id=1 is singleton)
    await db
      .insert(schema.seedMeta)
      .values({
        id: 1,
        version: receipt.version,
        mode: receipt.mode,
        gitSha: receipt.gitSha,
        seedBaseTime: receipt.seedBaseTime,
        runAt: receipt.runAt,
        runBy: receipt.runBy,
      })
      .onConflictDoUpdate({
        target: schema.seedMeta.id,
        set: {
          version: receipt.version,
          mode: receipt.mode,
          gitSha: receipt.gitSha,
          seedBaseTime: receipt.seedBaseTime,
          runAt: receipt.runAt,
          runBy: receipt.runBy,
        },
      });
  } catch (error) {
    console.warn('⚠️  Could not write seed_meta (table may not exist):', error);
  }
}

/**
 * Unified Seeding Runner
 *
 * Usage: tsx src/seed.ts [mode] [--reset]
 * Modes:
 *   - e2e:      Baseline (Golden) + KS Workflow Pack (Strict, deterministic)
 *   - golden:   Baseline (Golden) (Demo/QA)
 *   - full:     Baseline + Full Pack (Workload/Stress)
 *   - workload: Baseline + Workload overlay
 *
 * Flags:
 *   --reset: Force reset for golden/full/workload modes
 */
function resolveSeedBaseTime(mode: SeedMode): Date {
  if (mode === 'e2e') {
    return new Date(E2E_SEED_BASE_TIME);
  }
  return new Date();
}

async function main() {
  const args = process.argv.slice(2);
  const mode = (args.find(a => !a.startsWith('--')) || 'e2e') as SeedMode;
  const forceReset = args.includes('--reset');

  if (!['e2e', 'golden', 'full', 'workload'].includes(mode)) {
    console.error(`❌ Unknown mode: '${mode}'. Supported: e2e, golden, full, workload`);
    process.exit(1);
  }

  const seedBaseTime = resolveSeedBaseTime(mode);
  const receipt = buildReceipt(mode, seedBaseTime);
  logReceipt(receipt);

  // Dynamic imports after env is loaded
  const { db } = await import('./db');
  const schema = await import('./schema');

  // Check if reset is needed
  const { action, reason } = await checkSeedMeta(db, mode, forceReset);
  console.log(`🔍 Reset check: ${reason}`);

  if (action === 'skip') {
    console.log('⚠️  Skipping seed - data already exists. Use --reset to force.');
    process.exit(0);
  }

  if (action === 'block') {
    console.error('❌ Seed blocked. Refusing to modify existing data without explicit reset.');
    process.exit(1);
  }

  console.log(`🌱 Unified Seeder: Running mode '${mode}'...\n`);

  const config = createSeedConfig(mode, seedBaseTime);

  try {
    switch (mode) {
      case 'e2e':
        console.log('🚀 Mode: E2E (Baseline + KS Pack + Agent Pack)');
        await seedGolden(config);
        await seedKsWorkflowPack(config);
        await seedAgentPack(config);
        break;

      case 'golden':
        console.log('🏆 Mode: Golden (Baseline Only)');
        await seedGolden(config);
        break;

      case 'full':
        console.log('🌍 Mode: Full (Full System Seed)');
        await seedFull(config);
        break;

      case 'workload':
        console.log('🏋️ Mode: Workload (Golden + Workload Overlay)');
        await seedGolden(config);
        await seedWorkload(config);
        break;
    }

    // Write receipt to database
    await writeSeedMeta(db, schema, receipt);

    console.log(`\n✅ Seed Complete [${mode}]`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Seed Failed [${mode}]:`, error);
    process.exit(1);
  }
}

// Auto-run if executed directly
if (process.argv[1] === __filename) {
  main();
}
