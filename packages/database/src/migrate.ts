import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db';

import path from 'path';
import { config as loadEnv } from 'dotenv';
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

// Ensure DATABASE_URL is available when invoked from arbitrary shells.
loadEnvFromRoot();

console.log('Running Drizzle migrations...');
console.log('CWD:', process.cwd());
console.log('Migrations Folder:', path.resolve('./drizzle'));
console.log('DB URL Length:', process.env.DATABASE_URL?.length);

migrate(db, { migrationsFolder: './drizzle' })
  .then(() => {
    console.log('Migrations complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed!', err);
    process.exit(1);
  });
