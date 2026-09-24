import { expect, type Locator, type Page } from '@playwright/test';

// Test-only view of the loopback SMTP catcher (Mailpit) behind E2E_SMTP_HOST. One-time codes are
// opaque objects that redact themselves when serialised, inspected or printed by an assertion.
const REDACTED = '[redacted one-time code]';
const LOCAL_COPY = 'interdomestik_free_start_recovery_v1';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export class OtpMail {
  readonly id: string;
  readonly subject: string;
  readonly to: string;
  readonly #code: string;
  constructor(id: string, subject: string, to: string, code: string) {
    [this.id, this.subject, this.to, this.#code] = [id, subject, to, code];
  }
  get code() {
    return this.#code;
  }
  toJSON() {
    return { id: this.id, subject: this.subject, code: REDACTED };
  }
  toString() {
    return REDACTED;
  }
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `OtpMail(${REDACTED})`;
  }
}

export function mailboxConfigured() {
  return Boolean(process.env.E2E_SMTP_HOST?.trim());
}

function api(path: string) {
  const { hostname, port } = new URL(
    process.env.E2E_MAILPIT_API?.trim() || 'http://127.0.0.1:8025'
  );
  if (!LOOPBACK.has(hostname)) throw new Error('E2E_MAILPIT_API must be a loopback address');
  return `http://127.0.0.1:${Number(port) || 8025}/api/v1/${path}`;
}

type Summary = { ID: string; Subject: string; To: Array<{ Address: string }> };
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`mail catcher answered ${response.status}`);
  return (await response.json()) as T;
}

export async function waitForOtpMail(email: string, seen: Set<string>): Promise<OtpMail> {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${email}"`);
        const list = await json<{ messages: Summary[] }>(await fetch(api(`search?query=${query}`)));
        found = list.messages.find(message => !seen.has(message.ID));
        return Boolean(found);
      },
      { message: 'a one-time-code email arrived', timeout: 30_000 }
    )
    .toBe(true);
  const { ID, Subject, To } = found!;
  seen.add(ID);
  const body = await json<{ Text: string }>(await fetch(api(`message/${encodeURIComponent(ID)}`)));
  const code = body.Text.trim().split('\n').pop()?.trim() ?? '';
  expect(/^\d{6}$/.test(code), 'the last line of the message is a 6-digit code').toBe(true);
  return new OtpMail(ID, Subject, To[0]?.Address ?? '', code);
}

export async function deleteMail(ids: Set<string>) {
  if (!ids.size) return;
  const method = 'DELETE';
  const headers = { 'content-type': 'application/json' };
  const body = JSON.stringify({ IDs: [...ids] });
  const response = await fetch(api('messages'), { body, headers, method });
  if (!response.ok) throw new Error(`mail catcher delete answered ${response.status}`);
}

// Replaces known codes in a failure.
export function redact(error: unknown, mails: OtpMail[]): Error {
  let text = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  for (const mail of mails) text = text.split(mail.code).join(REDACTED);
  return new Error(text);
}

// Sets the value the way a keyboard would, without putting the code in a step title or call log.
// A failure is rethrown without the code so the step result carries none either.
export async function enter(field: Locator, code: string) {
  try {
    await field.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, code);
  } catch (error) {
    throw new Error(
      String((error as Error).message)
        .split(code)
        .join(REDACTED)
    );
  }
}

// Uses the page's native fetch path, so Chromium supplies Origin and cookies. Any failure is
// rethrown only after the delivered code has been removed from its text.
export async function postOtpFromBrowser(
  page: Page,
  email: string,
  code: string,
  tenantId: string
) {
  try {
    return await page.evaluate(
      async input => {
        const response = await fetch('/api/auth/sign-in/email-otp', {
          body: JSON.stringify({
            email: input.email,
            onboarding: { mode: 'deferred', tenant: input.tenantId },
            otp: input.code,
          }),
          headers: { 'content-type': 'application/json', 'x-tenant-id': input.tenantId },
          method: 'POST',
        });
        return response.status;
      },
      { code, email, tenantId }
    );
  } catch (error) {
    throw new Error(
      String((error as Error).message)
        .split(code)
        .join(REDACTED)
    );
  }
}

export const localCopy = (page: Page) =>
  page.evaluate(key => localStorage.getItem(key) !== null, LOCAL_COPY);
