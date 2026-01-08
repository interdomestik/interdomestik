import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const client = postgres(connectionString);
const db = drizzle(client);

async function testConnection() {
  try {
    console.log('Testing connection to:', connectionString);
    const result = await client`SELECT 1`;
    console.log('Connection successful:', result);
    process.exit(0);
  } catch (error) {
    console.error('Connection failed:', error);
    process.exit(1);
  }
}

void testConnection();
