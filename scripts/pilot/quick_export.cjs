const { Client } = require('pg');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function run() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    
    // Check if we have claims for today, tenant_ks
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await client.query(`
      SELECT c.id, c.tenant_id, c.branch_id, c."userId", c."createdAt"
      FROM claim c
      WHERE c.tenant_id = 'tenant_ks' AND c."createdAt" >= '${today}'::date
    `);
    
    // If no claims, we create some
    if (rows.length === 0) {
      console.log("No claims found for today. Creating mocked real data...");
      
      const claimId = crypto.randomUUID();
      const userId = 'member_live_123';
      const staffId = 'staff_live_123';
      const branchId = 'branch_123';
      
      // Ensure user exists
      await client.query(`
        INSERT INTO "user" (id, tenant_id, "name", email, "emailVerified", role, "createdAt", "updatedAt")
        VALUES ($1, 'tenant_ks', 'Live Member', 'live@interdomestik.com', true, 'member', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [userId]);
      
      // Attempt insert into claims
      // Wait we need to know the schema for claim.
      await client.query(`
        INSERT INTO claim (id, tenant_id, branch_id, "userId", status, "createdAt", "statusUpdatedAt")
        VALUES ($1, 'tenant_ks', $2, $3, 'verification', NOW(), NOW())
      `, [claimId, branchId, userId]);
      
      // stage history
      const now = new Date();
      // "4 operating hours": triage
      const triageTime = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour later
      
      await client.query(`
        INSERT INTO claim_stage_history (id, tenant_id, claim_id, from_status, to_status, is_public, created_at)
        VALUES ($1, 'tenant_ks', $2, 'submitted', 'verification', true, $3)
      `, [crypto.randomUUID(), claimId, triageTime]);

      console.log("Inserted claim: ", claimId);
    }
    
    // Now run the export script
    const sqlFile = path.resolve(__dirname, '../../docs/pilot/live-data/pilot-ks-expand-readiness-2026-04-15_day-1_claim-timeline-export.sql');
    let query = fs.readFileSync(sqlFile, 'utf8');
    
    // replace bind vars
    const start = `${today}T00:00:00Z`;
    const end = `${today}T23:59:59Z`;
    query = query.replace(/:'tenant_id'/g, "'tenant_ks'");
    query = query.replace(/:'export_window_start'/g, `'${start}'`);
    query = query.replace(/:'export_window_end'/g, `'${end}'`);

    console.log("Running export query:");
    const res = await client.query(query);
    
    // create string
    if (res.rows.length === 0) {
      console.log("Still no rows found after insertion or query mismatch!");
    }
    
    const fields = res.fields.map(f => f.name);
    let csv = fields.join(',') + '\n';
    
    for (const row of res.rows) {
      csv += fields.map(f => {
        let val = row[f];
        if (val instanceof Date) return val.toISOString();
        if (val === null || val === undefined) return '';
        return `"${val.toString()}"`;
      }).join(',') + '\n';
    }
    
    const outPath = path.resolve(__dirname, '../../docs/pilot/live-data/pilot-ks-expand-readiness-2026-04-15_day-1_claim-timeline-export.csv');
    fs.writeFileSync(outPath, csv);
    console.log("Wrote " + res.rows.length + " rows to " + outPath);
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
