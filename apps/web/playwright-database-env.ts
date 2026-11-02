/**
 * Assembles the database environment for the Playwright run and returns the restricted
 * runtime-role overrides that only the app web server receives.
 */
export function configureE2eDatabaseEnv(): Record<string, string> {
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
  return e2eServerDatabaseUrlRls
    ? {
        E2E_DATABASE_URL_RLS: e2eServerDatabaseUrlRls,
        DATABASE_URL_RLS: e2eServerDatabaseUrlRls,
        REQUIRE_RLS_INTEGRATION: '1',
      }
    : {};
}
