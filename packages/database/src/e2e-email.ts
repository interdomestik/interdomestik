/** The one mailbox domain of every synthetic E2E identity; seeds and tests never spell it. */
export const E2E_EMAIL_DOMAIN = 'interdomestik.com';

/** The synthetic E2E address for a local part, always in {@link E2E_EMAIL_DOMAIN}. */
export function e2eEmail(local: string): string {
  return `${local}@${E2E_EMAIL_DOMAIN}`;
}
