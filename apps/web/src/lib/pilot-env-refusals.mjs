const PRODUCTION_REFUSALS = new Set([
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'E2E_API_SECRET',
  'E2E_SMTP_HOST',
  'E2E_SMTP_PORT',
  'PLAYWRIGHT',
  'INTERDOMESTIK_AUTOMATED',
  'NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED',
  'INTERDOMESTIK_LOCAL_E2E',
  'INTERDOMESTIK_E2E_DIAGNOSTICS',
  'INTERDOMESTIK_E2E_FAKE_STORAGE_SIGNING',
  'BILLING_TEST_MODE',
  'NEXT_PUBLIC_BILLING_TEST_MODE',
]);

/** @param {string} name */
function refusesNonEmptyValue(name) {
  return (
    PRODUCTION_REFUSALS.has(name) ||
    name.startsWith('PADDLE_') ||
    name.startsWith('NEXT_PUBLIC_PADDLE_')
  );
}

// Code-unit order: the same deterministic order as the default sort, stated explicitly.
/** @param {string} left @param {string} right */
export function byCodeUnit(left, right) {
  if (left === right) {
    return 0;
  }
  if (left < right) {
    return -1;
  }
  return 1;
}

/** @param {Readonly<NodeJS.Dict<string>>} env */
export function refusedPilotEnvNames(env) {
  const refused = Object.keys(env).filter(name => env[name] && refusesNonEmptyValue(name));
  if (env.IDENTITY_PUBLIC_SIGN_UP === 'open') {
    refused.push('IDENTITY_PUBLIC_SIGN_UP');
  }
  return refused.sort(byCodeUnit);
}

/** @param {string[]} names */
export function publicPilotEnvNames(names) {
  return names.filter(name => name.startsWith('NEXT_PUBLIC_'));
}

/** @param {string | undefined} manifest @returns {string[]} */
export function readPilotBuildEnvManifest(manifest) {
  const invalidManifest =
    'Production release requires a valid INTERDOMESTIK_BUILT_PILOT_ENV manifest.';
  /** @type {unknown} */
  let names;
  try {
    names = JSON.parse(manifest ?? '');
  } catch {
    throw new Error(invalidManifest);
  }
  if (
    !Array.isArray(names) ||
    !names.every(
      name =>
        typeof name === 'string' && name.startsWith('NEXT_PUBLIC_') && refusesNonEmptyValue(name)
    )
  ) {
    throw new Error(invalidManifest);
  }
  return names;
}
