import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COOKIE_CONSENT_STORAGE_KEY } from '@/lib/cookie-consent';
import { CookieConsentBanner } from './cookie-consent-banner';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      title: 'Cookie Settings',
      description: 'We use cookies to improve your experience.',
      details:
        "By clicking 'Accept', you agree to our use of cookies for analytics and personalized content.",
      accept: 'Accept All',
      decline: 'Necessary Only',
    };
    return map[key] ?? key;
  },
}));

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders when no consent has been stored', async () => {
    render(<CookieConsentBanner />);

    expect(await screen.findByTestId('cookie-consent-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Necessary Only' })).toBeInTheDocument();
  });

  it('hides when consent is already stored', async () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'accepted');

    render(<CookieConsentBanner />);

    expect(screen.queryByTestId('cookie-consent-banner')).not.toBeInTheDocument();
  });

  it('stores consent and hides when user accepts', async () => {
    const user = userEvent.setup();
    render(<CookieConsentBanner />);

    const accept = await screen.findByRole('button', { name: 'Accept All' });
    await user.click(accept);

    expect(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe('accepted');
    expect(screen.queryByTestId('cookie-consent-banner')).not.toBeInTheDocument();
  });
});
