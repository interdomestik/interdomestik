import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalSetup() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  dotenv.config({ path: path.join(repoRoot, '.env') });
  const seedScript = path.join(repoRoot, 'scripts', 'seed-e2e-users.mjs');

  try {
    execSync(`node ${seedScript}`, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_HOST: process.env.PLAYWRIGHT_HOST ?? 'localhost',
      },
    });
  } catch (error) {
    console.warn('E2E seeding failed; tests may skip auth-dependent flows', error);
  }
}

export default globalSetup;
