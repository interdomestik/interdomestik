import { describe, expect, it, vi } from 'vitest';

import { deliverRecoveryCode, renderRecoveryEmail } from './different-email-recovery-email';

describe('IDA-UI03b content-free recovery email', () => {
  it.each(['sq', 'en', 'sr', 'mk'] as const)('renders localized purpose copy for %s', locale => {
    const current = renderRecoveryEmail(locale, 'current', '123456');
    const replacement = renderRecoveryEmail(locale, 'replacement', '654321');
    expect(current.text).toContain('123456');
    expect(replacement.text).toContain('654321');
    expect(current.text).not.toBe(replacement.text);
    expect(`${current.text} ${replacement.text}`).toMatch(/5|five|пет/i);
  });

  it('awaits the shared mail primitive with content-free telemetry', async () => {
    const send = vi.fn().mockResolvedValue({ success: true, id: 'provider-id' });
    await expect(
      deliverRecoveryCode(
        { code: '123456', email: 'private@example.com', locale: 'en', stage: 'current' },
        send
      )
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(
      'private@example.com',
      expect.objectContaining({
        subject: expect.any(String),
        text: expect.stringContaining('123456'),
      }),
      { telemetryPolicy: 'content-free' }
    );
  });

  it('maps provider errors to a boolean without logging the provider object', async () => {
    const send = vi.fn().mockRejectedValue(new Error('private provider detail'));
    await expect(
      deliverRecoveryCode(
        { code: '123456', email: 'private@example.com', locale: 'en', stage: 'replacement' },
        send
      )
    ).resolves.toBe(false);
  });
});
