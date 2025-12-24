import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

dotenv.config({ path: '../../.env' });

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  console.log('Patching database with notifications table...');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id text PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      type text NOT NULL,
      title text NOT NULL,
      content text NOT NULL,
      action_url text,
      is_read boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  console.log('Created notifications table.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
