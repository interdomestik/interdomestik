import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('../email', () => ({ sendEmail: hoisted.sendEmail }));

import { SIGN_IN_OTP_LOCALES } from '../sign-in-otp-email';
import { renderMemberActivationEmail, sendMemberActivationEmail } from './member-activation';

const origin = 'https://ks.interdomestik.com';

describe('member activation invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.sendEmail.mockResolvedValue({ success: true, id: 'msg-1' });
  });

  it('links only to the tenant sign-in page, in each locale with its own wording', () => {
    const subjects = new Set<string>();
    for (const locale of SIGN_IN_OTP_LOCALES) {
      const email = renderMemberActivationEmail(`${origin}/${locale}/login`, locale);
      expect(email.html).toContain(`href="${origin}/${locale}/login"`);
      expect(email.text).toContain(`${origin}/${locale}/login`);
      subjects.add(email.subject);
    }
    expect(subjects.size).toBe(SIGN_IN_OTP_LOCALES.length);
  });

  it.each([
    ['a token in the query', `${origin}/en/login?token=abc`],
    ['the address in the query', `${origin}/en/login?email=a%40b.com`],
    ['a fragment', `${origin}/en/login#token=abc`],
    ['credentials', 'https://user:pass@ks.interdomestik.com/en/login'],
    ['a reset page', `${origin}/en/reset-password`],
    ['another locale path', `${origin}/sq/login`],
    ['a script link', 'javascript:alert(1)//en/login'],
  ])('refuses a link with %s', (_label, url) => {
    expect(() => renderMemberActivationEmail(url, 'en')).toThrow(/bare tenant sign-in page/);
  });

  it('sends with content-free delivery telemetry and returns the delivery result', async () => {
    await expect(
      sendMemberActivationEmail('member@example.com', `${origin}/sq/login`, 'sq')
    ).resolves.toEqual({ success: true, id: 'msg-1' });
    expect(hoisted.sendEmail).toHaveBeenCalledWith(
      'member@example.com',
      expect.objectContaining({ subject: expect.any(String) }),
      { automatedCatcher: true, telemetryPolicy: 'content-free' }
    );
  });

  it('reports a missing recipient without sending', async () => {
    await expect(sendMemberActivationEmail('', `${origin}/en/login`, 'en')).resolves.toEqual({
      success: false,
      error: 'Missing recipient email',
    });
    expect(hoisted.sendEmail).not.toHaveBeenCalled();
  });
});
