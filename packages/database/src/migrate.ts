import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db';

async function main() {
  console.log('Running Drizzle migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed!', err);
  process.exit(1);
});
