import { administrativeSeedProfile } from './e2e-administrative-profile.mjs';

const carrierKeys = ['PW_APP_DATABASE_URL', 'PW_APP_DATABASE_URL_RLS', 'PW_APP_DB_RLS_ROLE'];

export function validateApplicationDatabaseProfile(env) {
  if (carrierKeys.some(key => !env[key]))
    throw new Error('Incomplete E2E application database profile');
  if (
    env.DATABASE_URL !== env.PW_APP_DATABASE_URL ||
    (env.E2E_DATABASE_URL && env.E2E_DATABASE_URL !== env.PW_APP_DATABASE_URL)
  ) {
    throw new Error('E2E application database target changed');
  }
  // Reuse only the local target validation; this does not execute an administrative child.
  administrativeSeedProfile('assert', { DATABASE_URL: env.PW_APP_DATABASE_URL });
  let admin, restricted, adminUsername, restrictedUsername;
  try {
    admin = new URL(env.PW_APP_DATABASE_URL);
    restricted = new URL(env.PW_APP_DATABASE_URL_RLS);
    adminUsername = decodeURIComponent(admin.username);
    restrictedUsername = decodeURIComponent(restricted.username);
  } catch {
    throw new Error('Invalid E2E application database profile');
  }
  if (
    !['postgres:', 'postgresql:'].includes(restricted.protocol) ||
    restricted.hostname !== admin.hostname ||
    restricted.port !== admin.port ||
    restricted.pathname !== admin.pathname ||
    restricted.search ||
    restricted.hash ||
    !restricted.password ||
    !restricted.username ||
    restrictedUsername === adminUsername ||
    restrictedUsername !== env.PW_APP_DB_RLS_ROLE
  ) {
    throw new Error('E2E application requires a distinct LOGIN on the same local database');
  }
  return {
    DATABASE_URL_RLS: env.PW_APP_DATABASE_URL_RLS,
    E2E_DATABASE_URL_RLS: env.PW_APP_DATABASE_URL_RLS,
    DB_RLS_ROLE: env.PW_APP_DB_RLS_ROLE,
  };
}

export function resolvePlaywrightDatabaseProfiles(parent) {
  const hasCarrier = carrierKeys.some(key => parent[key] !== undefined);
  const restricted = hasCarrier
    ? parent.PW_APP_DATABASE_URL_RLS
    : parent.E2E_DATABASE_URL_RLS || parent.DATABASE_URL_RLS;
  if (!hasCarrier && (!restricted || restricted === parent.DATABASE_URL)) {
    return { driver: {}, application: {} };
  }
  if (parent.INTERDOMESTIK_DB_PROFILE_SHA256) {
    throw new Error('Prebound database profile cannot become an E2E administrative driver');
  }
  const carrier = hasCarrier
    ? Object.fromEntries(carrierKeys.map(key => [key, parent[key]]))
    : {
        PW_APP_DATABASE_URL: parent.DATABASE_URL,
        PW_APP_DATABASE_URL_RLS: restricted,
        PW_APP_DB_RLS_ROLE: parent.DB_RLS_ROLE,
      };
  const application = validateApplicationDatabaseProfile({ ...parent, ...carrier });
  const { env } = administrativeSeedProfile('assert', parent);
  return {
    driver: {
      ...carrier,
      DATABASE_URL_RLS: env.DATABASE_URL_RLS,
      DB_RLS_ROLE: env.DB_RLS_ROLE,
      NODE_ENV: env.NODE_ENV,
      // Workers re-evaluate config. Keep this original application URL as a carrier.
      E2E_DATABASE_URL_RLS: application.E2E_DATABASE_URL_RLS,
    },
    application: { ...carrier, ...application },
  };
}

export function configurePlaywrightDatabaseProfiles(parent) {
  const normalized = { ...parent };
  normalized.DATABASE_URL =
    parent.E2E_DATABASE_URL?.trim() ||
    parent.DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  if (parent.E2E_DATABASE_URL?.trim()) normalized.E2E_DATABASE_URL = normalized.DATABASE_URL;
  normalized.DATABASE_URL_RLS =
    parent.E2E_DATABASE_URL_RLS?.trim() || parent.DATABASE_URL_RLS || normalized.DATABASE_URL;
  const profiles = resolvePlaywrightDatabaseProfiles(normalized);
  return {
    driver: {
      DATABASE_URL: normalized.DATABASE_URL,
      DATABASE_URL_RLS: normalized.DATABASE_URL_RLS,
      ...profiles.driver,
    },
    application: profiles.application,
  };
}
