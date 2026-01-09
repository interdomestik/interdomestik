import { execSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalSetup() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  // Load .env first, then .env.test with override to ensure E2E env vars bypass rate limiting
  dotenv.config({ path: path.join(repoRoot, '.env') });
  dotenv.config({ path: path.join(repoRoot, '.env.test'), override: true });
  const seedBranchesScript = path.join(repoRoot, 'scripts', 'seed-branches-manual.mjs');
  const seedScript = path.join(repoRoot, 'scripts', 'seed-e2e-users.mjs');
  const seedAgentCommand = 'pnpm seed:agent';

  // Seeding is expensive; cache it for local iterative runs.
  // - Set PLAYWRIGHT_FORCE_SEED=1 to always reseed
  // - Set PLAYWRIGHT_SKIP_SEED=1 to never seed
  const markerDir = path.join(repoRoot, '.playwright');
  const seedMarker = path.join(markerDir, 'seeded.marker');

  if (process.env.PLAYWRIGHT_SKIP_SEED === '1') {
    return;
  }

  if (process.env.PLAYWRIGHT_FORCE_SEED !== '1') {
    try {
      if (fs.existsSync(seedMarker)) {
        return;
      }
    } catch {
      // ignore
    }
  }

  try {
    execSync(`node ${seedBranchesScript}`, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_HOST: process.env.PLAYWRIGHT_HOST ?? 'localhost',
      },
    });
    execSync(`node ${seedScript}`, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_HOST: process.env.PLAYWRIGHT_HOST ?? 'localhost',
      },
    });
    execSync(seedAgentCommand, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_HOST: process.env.PLAYWRIGHT_HOST ?? 'localhost',
      },
    });

    try {
      fs.mkdirSync(markerDir, { recursive: true });
      fs.writeFileSync(seedMarker, new Date().toISOString(), 'utf8');
    } catch {
      // ignore
    }
  } catch (error) {
    console.warn('E2E seeding failed; tests may skip auth-dependent flows', error);
  }
}

export default globalSetup;
