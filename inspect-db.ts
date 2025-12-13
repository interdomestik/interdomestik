// @ts-nocheck
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function inspect() {
  const tables =
    await client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  console.log(
    'Tables:',
    tables.map(t => t.table_name)
  );

  const types =
    await client`SELECT typname FROM pg_type JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace WHERE nspname = 'public'`;
  console.log(
    'Types:',
    types.map(t => t.typname)
  );

  process.exit(0);
}

inspect();
