import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail } from './auth';

describe('renderPasswordResetEmail', () => {
  it('fits both a forgotten password and a new member, and links only the given URL', () => {
    const url = 'https://ks.example.test/sq/reset-password?token=abc';
    const email = renderPasswordResetEmail({ resetUrl: url });

    expect(email.subject).toBe('Set your password');
    expect(email.text).toContain(url);
    expect(email.text).toContain('membership was just created');
    expect(email.text).toContain('expires in 1 hour');
    expect(email.text).not.toMatch(/we received a request/i);
  });
});
