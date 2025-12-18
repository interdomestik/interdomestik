import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { db } from './src/index';

async function applyMigration() {
  try {
    console.log('📦 Applying notification preferences migration...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add-notification-preferences.sql'),
      'utf-8'
    );

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log('✅ Migration applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
