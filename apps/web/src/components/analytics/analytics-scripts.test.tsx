import { render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseCookieConsent = vi.fn();

vi.mock('@/lib/cookie-consent', () => ({
  useCookieConsent: () => mockUseCookieConsent(),
}));

vi.mock('next/script', () => ({
  default: ({
    id,
    nonce,
    src,
    onLoad,
  }: {
    id: string;
    nonce?: string;
    src?: string;
    onLoad?: () => void;
  }) => {
    if (id === 'google-tag-manager-src' && !(globalThis as { dataLayer?: unknown }).dataLayer) {
      throw new Error('GTM rendered before dataLayer initialization');
    }

    onLoad?.();

    return <div data-testid={id} data-nonce={nonce} data-src={src} />;
  },
}));

import { AnalyticsScripts } from './analytics-scripts';

describe('AnalyticsScripts', () => {
  const originalGtmId = process.env.NEXT_PUBLIC_GTM_ID;
  const originalMetaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCookieConsent.mockReturnValue({ consent: 'accepted' });
    process.env.NEXT_PUBLIC_GTM_ID = 'GTM-TEST';
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    delete (globalThis as { dataLayer?: unknown }).dataLayer;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_GTM_ID = originalGtmId;

    if (originalMetaPixelId === undefined) {
      delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
      return;
    }

    process.env.NEXT_PUBLIC_META_PIXEL_ID = originalMetaPixelId;
  });

  it('initializes dataLayer before rendering the GTM script', async () => {
    render(<AnalyticsScripts nonce="nonce-test" />);

    await waitFor(() => {
      expect(screen.getByTestId('google-tag-manager-src')).toBeInTheDocument();
    });

    expect(screen.getByTestId('google-tag-manager-src')).toHaveAttribute(
      'data-nonce',
      'nonce-test'
    );
    expect((globalThis as { dataLayer?: Array<Record<string, unknown>> }).dataLayer).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: 'gtm.js' })])
    );
  });
});
