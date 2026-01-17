import { E2E_USERS } from '@interdomestik/database';

const ALLOWED_EMAILS: Set<string> = new Set(Object.values(E2E_USERS).map(u => u.email));

export function assertSeededEmail(email: string) {
  if (!ALLOWED_EMAILS.has(email)) {
    throw new Error(
      `⛔️ TEST GUARD: Unrecognized email '${email}'.\n` +
        `Only users from E2E_USERS (seed receipt) are allowed in Gate/Golden tests.\n` +
        `Allowed: ${Array.from(ALLOWED_EMAILS).join(', ')}`
    );
  }
}
