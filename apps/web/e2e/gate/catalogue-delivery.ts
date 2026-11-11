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

/** Status and size of a stored object; never the URL, its token or a transport error's text. */
export type SignedObjectRead = { status: number; byteLength: number };

/**
 * Reads a signed storage URL outside Playwright's request instrumentation, which would keep the
 * URL in step parameters and transport-error logs. A failure surfaces only the given label.
 */
export async function readSignedObject(
  signedUrl: string,
  label: string,
  fetchImpl: typeof fetch = fetch
): Promise<SignedObjectRead> {
  let response: Response;
  try {
    response = await fetchImpl(signedUrl, { redirect: 'manual', cache: 'no-store' });
  } catch {
    throw new Error(`${label}: signed object read failed before a response`);
  }
  const byteLength = response.ok ? (await response.arrayBuffer()).byteLength : 0;
  return { status: response.status, byteLength };
}

/**
 * The metadata response carries a live signed URL, and a trace records every response body as it
 * arrives. The storage-signed lane therefore refuses a retained trace before its first request.
 */
export function signedLaneTraceAllowed(trace: unknown): boolean {
  const mode = typeof trace === 'string' ? trace : (trace as { mode?: unknown } | undefined)?.mode;
  return mode === undefined || mode === 'off';
}

/** Call before any request of a document test; throws for a traced storage-signed lane. */
export function requireUntracedSignedLane(
  trace: unknown,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (catalogueDelivery(env) === 'storage-signed' && !signedLaneTraceAllowed(trace)) {
    throw new Error('The storage-signed document lane must run with trace off');
  }
}
