import { hasConfiguredSupabaseStorage } from '../../src/lib/storage/storage-credentials';

export type DoorStorageCapability = 'real-storage' | 'fallback-signing';

export function doorStorageCapability(env: NodeJS.ProcessEnv = process.env): DoorStorageCapability {
  if (hasConfiguredSupabaseStorage(env)) {
    // createAdminClient reads this URL specifically, including for byte readback/cleanup.
    if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
      throw new Error('One-door storage proof requires NEXT_PUBLIC_SUPABASE_URL');
    }
    return 'real-storage';
  }
  // The external staging journey must never qualify row-only fallback evidence.
  // PW_EXTERNAL_SERVER is the server configuration switch, independent of project names.
  if (env.PW_EXTERNAL_SERVER === '1') {
    throw new Error(
      'One-door external staging journey requires real Supabase Storage configuration'
    );
  }
  // The managed local Playwright webServer explicitly enables fallback signing.
  return 'fallback-signing';
}
