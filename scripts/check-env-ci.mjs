/**
 * CI Environment Guard
 * Validates that required environment variables are present in CI.
 * This script is non-secret and only checks for the existence of keys.
 */

const REQUIRED_CI_VARS = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'NEXT_PUBLIC_APP_URL',
  'BETTER_AUTH_URL',
];

const optionalCiVars = [
  'E2E_DATABASE_URL', // Often falls back to DATABASE_URL
  'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET_KEY',
];

function checkEnv() {
  console.log('🔍 Checking CI Environment Variables...');
  
  const missing = [];
  
  for (const key of REQUIRED_CI_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Missing Required CI Environment Variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('
Ensure these are set in GitHub Actions Secrets or the workflow env block.');
    process.exit(1);
  }

  console.log('✅ All required CI environment variables are present.');
  
  // Warn about optional vars that might be needed for specific flows
  const missingOptional = optionalCiVars.filter(key => !process.env[key]);
  if (missingOptional.length > 0) {
    console.log('⚠️  Missing Optional CI Variables (some tests might be skipped):');
    missingOptional.forEach(key => console.log(`   - ${key}`));
  }
}

if (process.env.CI) {
  checkEnv();
} else {
  console.log('⏭️  Skipping CI Env Guard (Not in CI environment)');
}
