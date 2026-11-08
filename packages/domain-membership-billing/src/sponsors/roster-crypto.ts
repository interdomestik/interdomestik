import { createHmac } from 'node:crypto';

/**
 * ACQ-3b roster secrets. One server secret, domain-separated by label, keys the email identity
 * HMAC (§3.5) and the opt-out token (§3.8). A missing or short secret fails closed: no upload
 * binds and no token is issued.
 */
export const SPONSOR_ROSTER_SECRET_ENV = 'SPONSOR_ROSTER_SECRET';
const MIN_SECRET_LENGTH = 32;

export class SponsorRosterSecretMissingError extends Error {
  constructor() {
    super('Sponsor roster secret is not configured');
    this.name = 'SponsorRosterSecretMissingError';
  }
}

export function readSponsorRosterSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env[SPONSOR_ROSTER_SECRET_ENV]?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH) throw new SponsorRosterSecretMissingError();
  return secret;
}

export function normalizeRosterEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) && normalized.length <= 254
    ? normalized
    : null;
}

const hmac = (secret: string, label: string, value: string): string =>
  createHmac('sha256', secret).update(`${label}\u0000${value}`).digest('base64url');

export const rosterEmailHmac = (secret: string, normalizedEmail: string): string =>
  hmac(secret, 'sponsor-roster-email', normalizedEmail);

/** The opt-out token is derived, never stored; only its hash is kept on the entry. */
export const optOutToken = (secret: string, entryId: string): string =>
  hmac(secret, 'sponsor-roster-opt-out', entryId);

export const optOutTokenHash = (token: string): string =>
  createHmac('sha256', 'sponsor-roster-opt-out-hash').update(token).digest('base64url');
