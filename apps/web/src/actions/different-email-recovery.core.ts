import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { auth } from '@/lib/auth';
import { deliverRecoveryCode } from '@/lib/auth/different-email-recovery-email';
import {
  activateCurrentProof,
  activateReplacementProof,
  confirmReplacementProof,
  discardProof,
  reserveCurrentProof,
  reserveReplacementProof,
} from '@/lib/auth/different-email-recovery-store';
import { enforceOtpRateLimits, type OtpRateKind } from '@/lib/rate-limit-otp';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';
import {
  resolveSessionTenantConcepts,
  type TenantSessionLike,
} from '@/lib/tenant/tenant-session-context';

type Context = { email: string; tenantId: string; userId: string };
type Stage = 'current' | 'replacement';
type InputResult =
  { ok: true; stage: Stage | 'complete' } | { ok: false; code: 'invalid' | 'unavailable' };
type RateArgs = {
  email: string;
  headers: Headers;
  kind: OtpRateKind;
  secret: string;
  tenantId: string;
};
const locale = z.enum(['sq', 'en', 'sr', 'mk']);
const startSchema = z.strictObject({ locale });
// prettier-ignore
const currentSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/), email: z.string().trim().toLowerCase().email(), locale });
const replacementSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
const failure = (code: 'invalid' | 'unavailable' = 'unavailable') => ({ ok: false, code }) as const;

// prettier-ignore
async function resolveContext(headers: Headers): Promise<Context | null> {
  if (!evaluateNeutralOtpHost(headers)) return null;
  try {
    const session = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
    const view = session as TenantSessionLike & { user?: { email?: unknown; id?: unknown } };
    const userId = typeof view?.user?.id === 'string' ? view.user.id : null;
    const email = typeof view?.user?.email === 'string' ? view.user.email.trim() : null;
    const tenantId = resolveDefaultPublicTenantId(), accessTenantId = resolveSessionTenantConcepts(view).accessTenantId;
    return userId && email && tenantId && accessTenantId === tenantId ? { email, tenantId, userId } : null;
  } catch { return null; }
}

async function rate(args: RateArgs) {
  return !(await enforceOtpRateLimits({ ...args, dimensions: ['ip', 'identity'] }));
}

export type RecoveryDependencies = {
  activateCurrent: typeof activateCurrentProof;
  activateReplacement: typeof activateReplacementProof;
  confirmReplacement: typeof confirmReplacementProof;
  discard: typeof discardProof;
  nonce: () => string;
  now: () => Date;
  otp: () => string;
  rate: (args: RateArgs) => Promise<boolean>;
  reserveCurrent: typeof reserveCurrentProof;
  reserveReplacement: typeof reserveReplacementProof;
  resolveContext: (headers: Headers) => Promise<Context | null>;
  secret: () => string | null;
  send: typeof deliverRecoveryCode;
};

// prettier-ignore
const defaults: RecoveryDependencies = {
  activateCurrent: activateCurrentProof, activateReplacement: activateReplacementProof,
  confirmReplacement: confirmReplacementProof, discard: discardProof, nonce: randomUUID,
  now: () => new Date(), otp: () => randomInt(0, 1_000_000).toString().padStart(6, '0'), rate,
  reserveCurrent: reserveCurrentProof, reserveReplacement: reserveReplacementProof, resolveContext,
  secret: () => process.env.OTP_RATE_LIMIT_HMAC_SECRET ?? null, send: deliverRecoveryCode,
};

// prettier-ignore
async function discardQuietly(deps: RecoveryDependencies, userId: string, stage: Stage, nonce: string) {
  try { await deps.discard(userId, stage, nonce); } catch { /* exact-nonce cleanup is best effort */ }
}

export function recoveryDigest(secret: string, stage: Stage, email: string, code: string) {
  return createHmac('sha256', secret)
    .update(`IDA-UI03b\0${stage}\0${email.trim().toLowerCase()}\0${code}`)
    .digest('hex');
}

// prettier-ignore
async function authority(headers: Headers, deps: RecoveryDependencies) {
  const context = await deps.resolveContext(headers), secret = deps.secret();
  if (!context || !secret || Buffer.byteLength(secret) < 32 || secret === process.env.BETTER_AUTH_SECRET) return null;
  return { context, secret };
}

// prettier-ignore
export async function startDifferentEmailRecoveryCore(headers: Headers, input: unknown, deps = defaults): Promise<InputResult> {
  const parsed = startSchema.safeParse(input); if (!parsed.success) return failure('invalid');
  const authz = await authority(headers, deps); if (!authz) return failure();
  if (!(await deps.rate({ email: authz.context.email, headers, kind: 'send', secret: authz.secret, tenantId: authz.context.tenantId }))) return failure();
  const code = deps.otp(), nonce = deps.nonce(), now = deps.now();
  try {
    const reserved = await deps.reserveCurrent({ currentEmail: authz.context.email, digest: recoveryDigest(authz.secret, 'current', authz.context.email, code), nonce, now, userId: authz.context.userId });
    if (!reserved.ok) return failure();
    if (!(await deps.send({ code, email: authz.context.email, locale: parsed.data.locale, stage: 'current' }))) { await deps.discard(authz.context.userId, 'current', nonce); return failure(); }
    if (!(await deps.activateCurrent(authz.context.userId, nonce, authz.context.email, deps.now()))) { await deps.discard(authz.context.userId, 'current', nonce); return failure(); }
    return { ok: true, stage: 'current' };
  } catch { await discardQuietly(deps, authz.context.userId, 'current', nonce); return failure(); }
}

// prettier-ignore
export async function submitCurrentEmailProofCore(headers: Headers, input: unknown, deps = defaults): Promise<InputResult> {
  const parsed = currentSchema.safeParse(input); if (!parsed.success) return failure('invalid');
  const authz = await authority(headers, deps); if (!authz) return failure();
  const checks = [{ email: authz.context.email, kind: 'verify' as const }, { email: parsed.data.email, kind: 'send' as const }];
  for (const check of checks) if (!(await deps.rate({ ...check, headers, secret: authz.secret, tenantId: authz.context.tenantId }))) return failure();
  const code = deps.otp(), nonce = deps.nonce(), now = deps.now();
  try {
    const reserved = await deps.reserveReplacement({ currentDigest: recoveryDigest(authz.secret, 'current', authz.context.email, parsed.data.code), newEmail: parsed.data.email, nonce, now, replacementDigest: recoveryDigest(authz.secret, 'replacement', parsed.data.email, code), userId: authz.context.userId });
    if (!reserved.ok) return failure();
    if (!(await deps.send({ code, email: parsed.data.email, locale: parsed.data.locale, stage: 'replacement' }))) { await deps.discard(authz.context.userId, 'replacement', nonce); return failure(); }
    if (!(await deps.activateReplacement(authz.context.userId, nonce, deps.now()))) { await deps.discard(authz.context.userId, 'replacement', nonce); return failure(); }
    return { ok: true, stage: 'replacement' };
  } catch { await discardQuietly(deps, authz.context.userId, 'replacement', nonce); return failure(); }
}

// prettier-ignore
export async function confirmReplacementEmailCore(headers: Headers, input: unknown, deps = defaults): Promise<InputResult> {
  const parsed = replacementSchema.safeParse(input); if (!parsed.success) return failure('invalid');
  const authz = await authority(headers, deps); if (!authz) return failure();
  if (!(await deps.rate({ email: authz.context.email, headers, kind: 'verify', secret: authz.secret, tenantId: authz.context.tenantId }))) return failure();
  try {
    const result = await deps.confirmReplacement(authz.context.userId, email => recoveryDigest(authz.secret, 'replacement', email, parsed.data.code), deps.now());
    return result.ok ? { ok: true, stage: 'complete' } : failure();
  } catch { return failure(); }
}

// prettier-ignore
export function expireRecoverySessionCache(store: { delete: (name: string) => unknown }) {
  for (const name of ['better-auth.session_data', '__Secure-better-auth.session_data', '__Host-better-auth.session_data']) store.delete(name);
}
