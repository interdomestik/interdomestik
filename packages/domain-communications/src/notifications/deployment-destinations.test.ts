import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubDeploymentOrigin } from '../deployment-origin.test-support';
import { sendEmail } from '../email';
import { sendLifecycleEmail } from './notify-helpers';

vi.mock('../email', () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('lifecycle notification destinations', () => {
  it('accepts an absolute door destination and refuses foreign origins before dispatch', async () => {
    stubDeploymentOrigin();
    const props = {
      title: 'Update',
      intro: 'Update',
      actionUrl: 'https://staging.interdomestik.com/sq/member?ref=A%2B1',
    };
    await sendLifecycleEmail('member@example.test', props);
    expect(sendEmail).toHaveBeenCalledOnce();
    vi.mocked(sendEmail).mockClear();
    expect(() =>
      sendLifecycleEmail('member@example.test', { ...props, actionUrl: 'https://evil.test/member' })
    ).toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it.each(['sq', 'en', 'sr', 'mk', 'de'])('preserves %s path, token and query', async locale => {
    stubDeploymentOrigin();
    const path = `/${locale}/member/claims/claim_A?token=t%2F1&tab=events`;
    await sendLifecycleEmail('member@example.test', {
      title: 'Update',
      intro: 'Update',
      actionUrl: path,
    });
    expect(sendEmail).toHaveBeenCalledWith(
      'member@example.test',
      expect.objectContaining({
        text: expect.stringContaining(`https://staging.interdomestik.com${path}`),
        html: expect.stringContaining(
          `https://staging.interdomestik.com${path.replace('&', '&amp;')}`
        ),
      })
    );
  });

  it('rejects configuration before delivery', () => {
    stubDeploymentOrigin();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ida.interdomestik.com');
    expect(() =>
      sendLifecycleEmail('member@example.test', {
        title: 'Update',
        intro: 'Update',
        actionUrl: '/member',
      })
    ).toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each(['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_SITE_URL'])(
    'production refuses %s before any email provider call',
    key => {
      stubDeploymentOrigin('production', 'https://ida.interdomestik.com');
      vi.stubEnv(key, 'https://www.interdomestik.com');
      expect(() =>
        sendLifecycleEmail('member@example.test', {
          title: 'Update',
          intro: 'Update',
          actionUrl: '/de/member?token=a%2Fb',
        })
      ).toThrow();
      expect(sendEmail).not.toHaveBeenCalled();
    }
  );
});
