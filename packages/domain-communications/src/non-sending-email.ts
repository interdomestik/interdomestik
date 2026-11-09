/** RFC 2606/6761 reserve .invalid, including its subdomains, for non-delivery. */
export function isNonSendingEmail(recipient: string): boolean {
  return /@(?:[a-z\d-]+\.)*invalid\.?(?=$|[\s>,;])/i.test(recipient);
}

export const isAutomatedEmail = (): boolean =>
  ['INTERDOMESTIK_AUTOMATED', 'PLAYWRIGHT'].some(key => process.env[key] === '1');

/** Preserve automated mock/catcher routing and local SMTP; suppress external providers only. */
export function shouldSuppressExternalEmail(recipient: string): boolean {
  const loopbackSmtp = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
    process.env.SMTP_HOST?.trim().toLowerCase() ?? ''
  );
  return isNonSendingEmail(recipient) && !isAutomatedEmail() && !loopbackSmtp;
}
