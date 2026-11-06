import { isSuperAdmin } from '@/lib/roles.core';

// U2-e: the authenticated runtime-authority observation behind POST /api/health. A platform
// super admin's session is required before anything is observed; the only request input is a
// bounded random challenge. Failures carry fixed codes, never driver or auth error text.

export const ATTESTATION_SCHEMA_VERSION = 'ida.u2e-runtime-observation.v1';
const CHALLENGE = /^[\w-]{43}$/u;
const MAX_BODY_BYTES = 256;
// Above the observer's own database budget (deadline plus one statement timeout) and the driver's
// connect timeout, so the observation's transaction has ended before this answers 503.
const DEFAULT_TIMEOUT_MS = 12_000;

type Session = { user?: { role?: string | null } | null } | null;

export type RuntimeAttestationDeps<TObservation extends object> = {
  getSession: (headers: Headers) => Promise<Session>;
  observe: () => Promise<TObservation>;
  commitSha: () => string;
  now: () => Date;
  timeoutMs?: number;
};

export type RuntimeAttestationRequest = { headers: Headers; text: () => Promise<string> };

export type RuntimeAttestationResult =
  | { status: 200; body: Record<string, unknown> }
  | { status: 400 | 401 | 403 | 413 | 503; body: { error: string } };

const refuse = (status: 400 | 401 | 403 | 413 | 503, error: string): RuntimeAttestationResult => ({
  status,
  body: { error },
});

async function readChallenge(request: RuntimeAttestationRequest): Promise<string | 413 | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return 413;
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return 413;
  try {
    const body: unknown = JSON.parse(raw);
    const challenge = (body as { challenge?: unknown } | null)?.challenge;
    const keys = body && typeof body === 'object' ? Object.keys(body) : [];
    return keys.length === 1 && typeof challenge === 'string' && CHALLENGE.test(challenge)
      ? challenge
      : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('OBSERVATION_TIMEOUT')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function handleRuntimeAttestation<TObservation extends object>(
  request: RuntimeAttestationRequest,
  deps: RuntimeAttestationDeps<TObservation>
): Promise<RuntimeAttestationResult> {
  let session: Session;
  try {
    session = await deps.getSession(request.headers);
  } catch {
    return refuse(401, 'UNAUTHENTICATED');
  }
  if (!session?.user) return refuse(401, 'UNAUTHENTICATED');
  if (!isSuperAdmin(session.user.role ?? null)) return refuse(403, 'FORBIDDEN');

  const challenge = await readChallenge(request).catch(() => null);
  if (challenge === 413) return refuse(413, 'BODY_TOO_LARGE');
  if (challenge === null) return refuse(400, 'INVALID_CHALLENGE');

  let observation: TObservation;
  try {
    observation = await withTimeout(deps.observe(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (error) {
    const timedOut = error instanceof Error && error.message === 'OBSERVATION_TIMEOUT';
    return refuse(503, timedOut ? 'OBSERVATION_TIMEOUT' : 'OBSERVATION_FAILED');
  }
  return {
    status: 200,
    body: {
      ...observation,
      schemaVersion: ATTESTATION_SCHEMA_VERSION,
      challenge,
      commitSha: deps.commitSha(),
      observedAt: deps.now().toISOString(),
    },
  };
}
