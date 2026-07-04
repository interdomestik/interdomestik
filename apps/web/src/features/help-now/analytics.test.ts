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

  it('applies the property allowlist across all anonymous funnel events', () => {
    const events = [
      'help_now_opened',
      'checklist_item_done',
      'trip_pack_downloaded',
      'evidence_bundle_created',
      'claim_pack_generated',
    ] as const;

    events.forEach(event => {
      trackHelpNowEvent(event, {
        country: 'XK',
        // @ts-expect-error guard test for accidental free-text leakage
        description: 'private crash note',
      });
    });

    events.forEach((event, index) => {
      expect(trackEvent).toHaveBeenNthCalledWith(index + 1, event, { country: 'XK' });
    });
  });
});
