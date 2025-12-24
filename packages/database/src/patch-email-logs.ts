import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

dotenv.config({ path: '../../.env' });

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  console.log('Patching database...');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_campaign_logs (
      id text PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL REFERENCES "user"(id),
      campaign_id text NOT NULL,
      sent_at timestamp NOT NULL DEFAULT now()
    );
  `);

  console.log('Created email_campaign_logs table.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
