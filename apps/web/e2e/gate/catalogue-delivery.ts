import { hasConfiguredSupabaseStorage } from '../../src/lib/storage/storage-credentials';

/**
 * How the target delivers catalogue documents. The managed local server serves the deterministic
 * E2E storage placeholder through the authenticated proxy. The external staging journey
 * (PW_EXTERNAL_SERVER=1) runs on real Supabase Storage and signs URLs for real objects, so it must
 * prove stored bytes: a missing object fails that lane rather than skipping it (ADR-12).
 */
export type CatalogueDelivery = 'authenticated-proxy' | 'storage-signed' | 'unavailable';

export function catalogueDelivery(env: NodeJS.ProcessEnv = process.env): CatalogueDelivery {
  if (env.PW_EXTERNAL_SERVER === '1') return 'storage-signed';
  return hasConfiguredSupabaseStorage(env) ? 'unavailable' : 'authenticated-proxy';
}

/** A local server with configured storage has no objects behind the row-only local seed. */
export const LOCAL_CONFIGURED_STORAGE_SKIP =
  'Local catalogue documents have no backing storage objects; run on deterministic E2E storage';
