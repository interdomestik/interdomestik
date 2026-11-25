import { execSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { E2E_TENANT_STATE_FIXTURES } from './e2e-tenant-state-fixtures';
import { PILOT_SWITCH_CATEGORY, PILOT_SWITCH_KEYS } from './pilot-switch';
import {
  assertDisposableTarget,
  assertSeedModeAllowed,
  assertSeedTargetAllowed,
  importSeedDatabase,
  exitSeed,
} from './seed-target-guard';
import { seedFull } from './seed-full';
import { seedGolden } from './seed-golden';
import { cleanSeededLegalAcceptance, seedLegalAcceptance } from './seed-golden/index';
import { runSeedMode } from './seed-mode';
import { TENANTS } from './seed-golden/constants';
import { seedAgentPack } from './seed-packs/agent-pack';
import { seedKsWorkflowPack } from './seed-packs/ks-workflow-pack';
import { buildReceipt, logReceipt, type SeedReceipt } from './seed-receipt';
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

/** Deterministic base time for seeding (ensures reproducible timestamps). */
const E2E_SEED_BASE_TIME = new Date('2026-01-01T00:00:00Z');

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
 * Check existing seed meta and determine if reset is needed
 */
async function checkSeedMeta(
  db: any,
  mode: SeedMode,
  forceReset: boolean
): Promise<{ action: 'seed' | 'skip' | 'block'; reason: string }> {
  const existingMeta = await readSeedMeta(db);
  if (existingMeta) {
    if (mode === 'e2e') {
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

async function seedOpenPilotSwitches(
  db: Awaited<ReturnType<typeof importSeedDatabase>>['db'],
  { tenantSettings }: typeof import('./schema')
) {
  const tenantIds = [
    ...Object.values(TENANTS),
    ...Object.values(E2E_TENANT_STATE_FIXTURES).map(tenant => tenant.id),
  ];
  const value = { enabled: true, revision: 1 };
  await db
    .insert(tenantSettings)
    .values(
      tenantIds.flatMap(tenantId =>
        PILOT_SWITCH_KEYS.map(key => ({
          id: `e2e_pilot_${tenantId}_${key}`,
          tenantId,
          category: PILOT_SWITCH_CATEGORY,
          key,
          value,
        }))
      )
    )
    .onConflictDoUpdate({
      target: [tenantSettings.tenantId, tenantSettings.category, tenantSettings.key],
      set: { value },
    });
}

async function main() {
  const targetClassification = assertSeedTargetAllowed(process.env);
  const args = process.argv.slice(2);
  const mode = (args.find(a => !a.startsWith('--')) || 'e2e') as SeedMode;
  const forceReset = args.includes('--reset');

  if (!['e2e', 'golden', 'full', 'workload'].includes(mode)) {
    console.error(`❌ Unknown mode: '${mode}'. Supported: e2e, golden, full, workload`);
    await exitSeed(1);
  }
  assertSeedModeAllowed(mode, targetClassification);
  if (mode === 'e2e') {
    assertDisposableTarget(process.env);
  }

  const seedBaseTime = resolveSeedBaseTime(mode);
  const receipt = buildReceipt(mode, seedBaseTime, getGitSha());
  logReceipt(receipt);

  // Dynamic imports after env is loaded
  const { db } = await importSeedDatabase();
  const schema = await import('./schema');

  // Check if reset is needed
  const { action, reason } = await checkSeedMeta(db, mode, forceReset);
  console.log(`🔍 Reset check: ${reason}`);

  if (action === 'skip') {
    console.log('⚠️  Skipping seed - data already exists. Use --reset to force.');
    await exitSeed(0);
  }

  if (action === 'block') {
    console.error('❌ Seed blocked. Refusing to modify existing data without explicit reset.');
    await exitSeed(1);
  }

  console.log(`🌱 Unified Seeder: Running mode '${mode}'...\n`);

  const config = createSeedConfig(mode, seedBaseTime);

  try {
    await runSeedMode(
      config,
      {
        seedAgentPack,
        seedFull,
        seedGolden,
        seedKsWorkflowPack,
        seedOpenPilotSwitches: () => seedOpenPilotSwitches(db, schema),
        seedWorkload,
      },
      targetClassification === 'confirmed-non-local'
        ? undefined
        : { clean: cleanSeededLegalAcceptance, seed: seedLegalAcceptance }
    );

    // Write receipt to database
    await writeSeedMeta(db, schema, receipt);

    console.log(`\n✅ Seed Complete [${mode}]`);
    await exitSeed(0);
  } catch (error) {
    console.error(`\n❌ Seed Failed [${mode}]:`, error);
    await exitSeed(1);
  }
}

if (process.argv[1] === __filename) {
  main().catch(error => exitSeed(1, error));
}
