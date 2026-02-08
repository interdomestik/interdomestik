import { config as loadEnv } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
}

// Load env vars BEFORE anything else
loadEnvFromRoot();

async function runMigrations() {
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const { db } = await import('./db');

  console.log('Running Drizzle migrations...');
  console.log('CWD:', process.cwd());
  console.log('Migrations Folder:', path.resolve('./drizzle'));
  console.log('DB URL Length:', process.env.DATABASE_URL?.length);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed!', err);
    process.exit(1);
  }
}

void runMigrations();
