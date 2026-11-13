import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import {
  deliverRecoveryCode,
  renderRecoveryEmail,
} from '@/lib/auth/different-email-recovery-email';

const provider = vi.hoisted(() => vi.fn());
beforeEach(() => {
  stubDeploymentOrigin('production', 'https://www.interdomestik.com');
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 'mail' }), { status: 200 }))
    );
  vi.stubGlobal('fetch', provider);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(['sq', 'en', 'sr', 'mk', 'de'] as const)(
  'preserves %s recovery-code output and delivery under retained www config',
  async locale => {
    for (const stage of ['current', 'replacement'] as const) {
      provider.mockClear();
      await expect(
        deliverRecoveryCode({ code: '123456', email: 'member@example.test', locale, stage })
      ).resolves.toBe(true);
      expect(provider).toHaveBeenCalledOnce();
      const request = JSON.parse(provider.mock.calls[0][1].body);
      expect(request).toMatchObject(renderRecoveryEmail(locale, stage, '123456'));
    }
  }
);
