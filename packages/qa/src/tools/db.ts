import * as pg from 'pg';

export async function queryDb(args: { text: string; params?: any[] }) {
  const { text, params } = args;
  if (!process.env.DATABASE_URL) {
    return { content: [{ type: 'text', text: 'Error: DATABASE_URL not set' }] };
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const res = await client.query(text, params);
    await client.end();
    return { content: [{ type: 'text', text: JSON.stringify(res.rows, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Database Error: ${e.message}` }] };
  }
}
