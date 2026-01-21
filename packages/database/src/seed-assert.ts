import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { goldenId } from './seed-utils/seed-ids';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFromRoot() {
  const rootDir = path.resolve(__dirname, '../../..');
  const envFiles = ['.env', '.env.local', '.env.test'];

  for (const file of envFiles) {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      loadEnv({ path: filePath });
    }
  }
}

loadEnvFromRoot();

async function assertSeed() {
  const { db } = await import('./db');
  const schema = await import('./schema');
  const { and, eq, inArray, ne } = await import('drizzle-orm');
  // We can use a raw query or import schema if needed, but raw is safer for a quick check.
  // seed_meta table: id, version, mode, run_at

  try {
    console.log('🔍 Asserting E2E Seed Status...');
    const result = await db.execute(
      'SELECT mode, version FROM seed_meta ORDER BY run_at DESC LIMIT 1'
    );

    if (result.length === 0) {
      console.error('❌ No seed metadata found. Database might be unseeded.');
      process.exit(1);
    }

    const lastRun = result[0];
    if (lastRun.mode !== 'e2e') {
      console.error(`❌ Incorrect seed mode. Expected 'e2e', found '${lastRun.mode}'.`);
      process.exit(1);
    }

    console.log(
      `✅ Seed Verification Passed: Mode='${lastRun.mode}', Version='${lastRun.version}'`
    );

    console.log('🔍 Asserting KS agent A1 has visible claims...');
    const agentId = goldenId('ks_agent_a1');
    const tenantId = 'tenant_ks';

    const members = await db.query.user.findMany({
      where: and(eq(schema.user.tenantId, tenantId), eq(schema.user.agentId, agentId)),
      columns: { id: true },
    });

    if (members.length === 0) {
      console.error('❌ Seed invariant failed: KS agent A1 has no assigned members.');
      process.exit(1);
    }

    const memberIds = members.map(m => m.id);
    const claims = await db.query.claims.findMany({
      where: and(
        eq(schema.claims.tenantId, tenantId),
        inArray(schema.claims.userId, memberIds),
        ne(schema.claims.status, 'draft')
      ),
      columns: { id: true },
    });

    if (claims.length === 0) {
      console.error('❌ Seed invariant failed: KS agent A1 has no visible claims.');
      process.exit(1);
    }

    console.log(`✅ KS agent A1 visible claims: ${claims.length}`);

    // Assert Share Pack documents exist
    console.log('🔍 Asserting Share Pack documents exist...');
    const docIds = ['doc-ks-1', 'doc-ks-2'];
    const docs = await db.query.documents.findMany({
      where: inArray(schema.documents.id, docIds),
      columns: { id: true },
    });

    if (docs.length !== docIds.length) {
      console.error(
        `❌ Seed invariant failed: Expected ${docIds.length} share-pack documents, found ${docs.length}`
      );
      process.exit(1);
    }

    console.log(`✅ Share Pack documents: ${docs.length} found`);
    process.exit(0);
  } catch (err: any) {
    // If table doesn't exist or query fails
    console.error('❌ Assertion failed:', err.message);
    process.exit(1);
  }
}

if (process.argv[1] === __filename) {
  assertSeed();
}
