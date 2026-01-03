require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Load env (assuming .env is present or variables are set)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.log(
    'Usage: NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node scripts/abuse_test_rls.js'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkTable(tableName, description) {
  console.log(`\n🔍 Testing access to table: "${tableName}" (${description})...`);
  const { data, error } = await supabase.from(tableName).select('*').limit(1);

  if (error) {
    if (error.code === '42501' || error.message.includes('permission denied')) {
      console.log(`✅ SECURE: Access denied for anon user.`);
    } else if (error.code === '42P01') {
      console.log(`⚠️  WARNING: Table "${tableName}" does not exist (or not visible).`);
    } else {
      console.log(`❓ ERROR: ${error.message} (Code: ${error.code})`);
    }
  } else {
    console.log(`❌ VULNERABLE: Data accessed!`);
    if (data.length > 0) {
      console.log('   Proof:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('   (Table is empty, but query succeeded on a public table)');
    }
  }
}

async function run() {
  console.log('🔒 Interdomestik RLS Abuse Test');
  console.log('===============================');
  console.log('Target: ', SUPABASE_URL);

  // Test Better Auth Tables (Likely Vulnerable)
  await checkTable('user', 'Better Auth User Table (PII)');
  await checkTable('session', 'Better Auth Session Table (Hijacking risk)');
  await checkTable('account', 'Better Auth Account Table');

  // Test Supabase Schema Tables (Likely Secure if RLS enabled)
  await checkTable('users', 'Supabase Legacy User Table');
  await checkTable('subscriptions', 'Subscriptions Table');
}

run();
