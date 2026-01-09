import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  const users = await sql`SELECT * FROM "user" WHERE email = 'manager-a@test.com'`;
  console.log('User Record:', users[0]);
  process.exit(0);
}

main().catch(console.error);
