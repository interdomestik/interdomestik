import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db';

import path from 'path';

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
