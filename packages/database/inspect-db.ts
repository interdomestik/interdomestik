import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not defined');
    process.exit(1);
  }
  const sql = postgres(connectionString);

  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'claim';
  `;

  console.log('Columns for table "claim":');
  cols.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));

  await sql.end();
}

main();
