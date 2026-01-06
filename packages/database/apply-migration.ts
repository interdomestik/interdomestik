import 'dotenv/config';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { db } from './src/index';

async function applyMigration() {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    if (migrationFiles.length === 0) {
      console.log('ℹ️  No migrations found.');
      process.exit(0);
    }

    for (const file of migrationFiles) {
      console.log(`📦 Applying migration: ${file}`);
      const migrationSQL = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.execute(sql.raw(migrationSQL));
    }

    console.log('✅ Migrations applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
