// @ts-nocheck
import 'dotenv/config';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);

async function inspect() {
  for (const table of ['user', 'session', 'account', 'verification']) {
    const columns = await client`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = ${table}
      AND table_schema = 'public'
    `;
    console.log(`Columns in "${table}" table:`);
    columns.forEach(c => console.log(`- ${c.column_name}: ${c.data_type}`));
  }

  process.exit(0);
}

inspect();
