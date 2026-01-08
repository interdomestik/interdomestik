import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db';

console.log('Running Drizzle migrations...');
try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete!');
  process.exit(0);
} catch (err) {
  console.error('Migration failed!', err);
  process.exit(1);
}
