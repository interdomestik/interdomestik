import addressparser from 'nodemailer/lib/addressparser';

export type EmailRecipients = string | readonly string[];
export const suppressedEmailResult = {
  success: false,
  suppressed: true,
  error: 'email_suppressed',
} as const;

export const isAutomatedEmail = (): boolean =>
  ['INTERDOMESTIK_AUTOMATED', 'PLAYWRIGHT'].some(key => process.env[key] === '1');

// The existing credential-mail opt-in: automation plus a validated E2E loopback catcher.
export function automatedSmtpTarget() {
  const host = process.env.E2E_SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.E2E_SMTP_PORT?.trim() || '1025');
  const valid =
    ['127.0.0.1', 'localhost', '::1'].includes(host) &&
    Number.isInteger(port) &&
    port > 0 &&
    port < 65536;
  if (!valid) return 'rejected' as const;
  return { host, port, connectionTimeout: 5000, socketTimeout: 10000 };
}

/** Parse mailbox syntax, never display-name text, before applying RFC 2606/6761. */
export function isNonSendingEmail(mailbox: string): boolean {
  if (!mailbox.includes('@')) return false;
  const domain = mailbox
    .slice(mailbox.lastIndexOf('@') + 1)
    .toLowerCase()
    .replace(/\.$/, '');
  return domain === 'invalid' || domain.endsWith('.invalid');
}

export function selectEmailRecipients(
  to: EmailRecipients,
  automatedCatcher = false
): string | string[] {
  const target = automatedCatcher && isAutomatedEmail() ? automatedSmtpTarget() : null;
  const catcherAllowed = !!target && target !== 'rejected';
  const values = typeof to === 'string' ? [to] : to;
  const recipients = values
    .flatMap(value => addressparser(value, { flatten: true }))
    .map(mailbox => mailbox.address)
    .filter(mailbox => mailbox && (catcherAllowed || !isNonSendingEmail(mailbox)));
  return recipients.length > 1 ? recipients : (recipients[0] ?? '');
}

export function isEmailSuppressed(to: EmailRecipients, automatedCatcher = false): boolean {
  return !selectEmailRecipients(to, automatedCatcher);
}

/** Campaign callbacks must not turn a resolved suppression into a sent receipt. */
export function requireEmailDelivery(result: {
  success: boolean;
  error?: string;
  suppressed?: boolean;
}): void | 'skipped' {
  if (result.suppressed || result.error === 'email_suppressed') return 'skipped';
  if (!result.success) throw new Error(result.error ?? 'email_delivery_failed');
}
