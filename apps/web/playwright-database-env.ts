/**
 * Assembles the database environment for the Playwright run and returns the shell prefix that
 * gives only the app web server the restricted runtime role. The prefix names the variable
 * instead of embedding its credential because JSON reports serialize webServer settings.
 */
export function configureE2eDatabaseEnv(): string {
  const e2eDatabaseUrl = process.env.E2E_DATABASE_URL?.trim();
  if (e2eDatabaseUrl) {
    process.env.DATABASE_URL = e2eDatabaseUrl;
  }

  if (!process.env.DATABASE_URL) {
    console.log('⚠️ DATABASE_URL not found, using default local fallback.');
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  }

  const e2eDatabaseUrlRls = process.env.E2E_DATABASE_URL_RLS?.trim();
  if (e2eDatabaseUrlRls) {
    process.env.DATABASE_URL_RLS = e2eDatabaseUrlRls;
  } else if (!process.env.DATABASE_URL_RLS) {
    process.env.DATABASE_URL_RLS = process.env.DATABASE_URL;
  }

  // Fixtures keep the setup credential; only the app server runs as the restricted runtime role
  // and must prove that role cannot bypass RLS before its first query.
  const e2eServerDatabaseUrlRls = process.env.E2E_SERVER_DATABASE_URL_RLS?.trim();
  if (!e2eServerDatabaseUrlRls) return '';
  process.env.E2E_SERVER_DATABASE_URL_RLS = e2eServerDatabaseUrlRls;
  const runtimeUrl = '"$E2E_SERVER_DATABASE_URL_RLS"';
  return `E2E_DATABASE_URL_RLS=${runtimeUrl} DATABASE_URL_RLS=${runtimeUrl} REQUIRE_RLS_INTEGRATION=1 `;
}
