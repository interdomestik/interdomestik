import { sendEmail } from '../email';
import type { EmailResult, SignInOtpLocale } from '../sign-in-otp-email';

// ACQ-2b2: a converted member is created unverified and invited to sign in with an email code.
// The first code sign-in proves the mailbox, verifies the account and clears anything left on
// it; a password can be set afterwards. The invite therefore carries no token and no email
// address: only the tenant's sign-in page.

type ActivationCopy = Readonly<{ subject: string; body: string; action: string }>;

const COPY: Record<SignInOtpLocale, ActivationCopy> = {
  sq: {
    subject: 'Anëtarësimi juaj në Interdomestik: hyni në llogari',
    body: "Anëtarësimi juaj është krijuar. Për të hyrë, hapni lidhjen më poshtë dhe shkruani këtë adresë email-i; do t'ju dërgojmë një kod njëpërdorimësh. Askush nga Interdomestik nuk do t'jua kërkojë këtë kod. Nëse nuk e prisnit këtë mesazh, mund ta shpërfillni.",
    action: 'Hyni',
  },
  en: {
    subject: 'Your Interdomestik membership: sign in',
    body: 'Your membership has been set up. To sign in, open the link below and enter this email address; we will send you a one-time code. Nobody from Interdomestik will ask you for that code. If you did not expect this message, you can ignore it.',
    action: 'Sign in',
  },
  sr: {
    subject: 'Vaše članstvo u Interdomestiku: prijavite se',
    body: 'Vaše članstvo je kreirano. Da biste se prijavili, otvorite link ispod i unesite ovu e-adresu; poslaćemo vam jednokratni kod. Niko iz Interdomestika vas neće tražiti taj kod. Ako niste očekivali ovu poruku, možete je zanemariti.',
    action: 'Prijava',
  },
  mk: {
    subject: 'Вашето членство во Interdomestik: најавете се',
    body: 'Вашето членство е креирано. За да се најавите, отворете ја врската подолу и внесете ја оваа адреса на е-пошта; ќе ви испратиме еднократен код. Никој од Interdomestik нема да ве праша за тој код. Ако не ја очекувавте оваа порака, можете да ја игнорирате.',
    action: 'Најава',
  },
};

/**
 * Accepts only a bare sign-in page: http(s), no credentials, query or fragment, and a path of
 * exactly /{locale}/login. Anything else could carry a token or the member's address.
 */
export function assertActivationSignInUrl(signInUrl: string, locale: SignInOtpLocale): URL {
  const url = new URL(signInUrl);
  const bare =
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === `/${locale}/login`;
  if (!bare) throw new Error('Activation invite link must be the bare tenant sign-in page');
  return url;
}

export function renderMemberActivationEmail(signInUrl: string, locale: SignInOtpLocale) {
  const copy = COPY[locale];
  const href = assertActivationSignInUrl(signInUrl, locale).toString();
  return {
    subject: copy.subject,
    html: [
      '<div style="font-family: sans-serif; padding: 20px; color: #0f172a;">',
      `<h2 style="margin: 0 0 16px;">${copy.subject}</h2>`,
      `<p style="margin: 0 0 16px;">${copy.body}</p>`,
      `<p style="margin: 24px 0;"><a href="${href}" style="background: #0f172a; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none;">${copy.action}</a></p>`,
      `<p style="margin: 0; color: #475569; font-size: 13px;">${href}</p>`,
      '</div>',
    ].join(''),
    text: `${copy.body}\n\n${copy.action}: ${href}`,
  };
}

/** Sends the invite with content-free delivery telemetry; the caller checks the result. */
export function sendMemberActivationEmail(
  to: string,
  signInUrl: string,
  locale: SignInOtpLocale
): Promise<EmailResult> {
  if (!to) return Promise.resolve({ success: false, error: 'Missing recipient email' });
  return sendEmail(to, renderMemberActivationEmail(signInUrl, locale), {
    automatedCatcher: true,
    telemetryPolicy: 'content-free',
  });
}
