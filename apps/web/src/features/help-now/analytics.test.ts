import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackHelpNowEvent } from './analytics';

const trackEvent = vi.fn();

vi.mock('@/lib/analytics', () => ({
  trackEvent: (event: string, props?: Record<string, unknown>) => trackEvent(event, props),
}));

describe('MOB-01 anonymous funnel analytics', () => {
  beforeEach(() => trackEvent.mockClear());

  it('drops non-contract properties before sending events', () => {
    trackHelpNowEvent('help_now_opened', {
      country: 'XK',
      offline: true,
      // @ts-expect-error guard test for accidental free-text leakage
      narrative: 'other driver said something',
    });

    expect(trackEvent).toHaveBeenCalledWith('help_now_opened', {
      country: 'XK',
      offline: true,
    });
  });
});
