import * as pg from 'pg';
import { loadToolEnv } from '../utils/root-env.js';
import { resolveToolRepoRoot, type ToolRepoArgs } from '../utils/tool-repo-root.js';

export async function queryDb(args: ToolRepoArgs & { text: string; params?: unknown[] }) {
  const context = resolveToolRepoRoot(args);
  const { text, params } = args;
  const databaseUrl = loadToolEnv(context.repoRoot).DATABASE_URL;
  if (!databaseUrl) {
    return {
      content: [{ type: 'text', text: 'Error: DATABASE_URL not set' }],
      isError: true,
      structuredContent: { ...context, status: 'error', tool: 'query_db' },
    };
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const res = await client.query(text, params);
    await client.end();
    return {
      content: [{ type: 'text', text: JSON.stringify(res.rows, null, 2) }],
      structuredContent: { ...context, status: 'ok', tool: 'query_db' },
    };
  } catch (e: any) {
    return {
      content: [{ type: 'text', text: `Database Error: ${e.message}` }],
      isError: true,
      structuredContent: { ...context, status: 'error', tool: 'query_db' },
    };
  }
}
