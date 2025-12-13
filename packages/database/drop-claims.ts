import 'dotenv/config';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);

async function clean() {
  console.log('Dropping legacy claim tables and types...');
  const tables = [
    'claims',
    'claim_documents',
    'claim_messages',
    'claim_timeline',
    'documents',
    'messages',
    'timeline',
  ];
  const types = [
    'claim_category',
    'claim_status',
    'document_category',
    'claim_priority',
    'resolution_type',
    'subscription_plan',
    'subscription_status',
    'user_role',
  ];

  try {
    for (const table of tables) {
      await client`DROP TABLE IF EXISTS ${client(table)} CASCADE`;
    }
    for (const type of types) {
      await client`DROP TYPE IF EXISTS ${client(type)} CASCADE`;
    }
    console.log('Cleaned successfully.');
  } catch (e) {
    console.error('Error cleaning:', e);
  }
  process.exit(0);
}
clean();
