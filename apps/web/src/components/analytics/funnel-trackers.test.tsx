import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FunnelActivationTracker, FunnelLandingTracker } from './funnel-trackers';

const mockLandingViewed = vi.fn();
const mockActivationCompleted = vi.fn();
const mockResolveFunnelVariant = vi.fn((enabled: boolean) => (enabled ? 'hero_v2' : 'hero_v1'));

vi.mock('@/lib/analytics', () => ({
  FunnelEvents: {
    landingViewed: (...args: unknown[]) => mockLandingViewed(...args),
    activationCompleted: (...args: unknown[]) => mockActivationCompleted(...args),
  },
  resolveFunnelVariant: (...args: unknown[]) => mockResolveFunnelVariant(...args),
}));

describe('Funnel trackers', () => {
  it('tracks landing with tenant and variant context', () => {
    render(<FunnelLandingTracker tenantId="tenant_ks" locale="sq" uiV2Enabled={true} />);

    expect(mockResolveFunnelVariant).toHaveBeenCalledWith(true);
    expect(mockLandingViewed).toHaveBeenCalledWith({
      tenantId: 'tenant_ks',
      variant: 'hero_v2',
      locale: 'sq',
    });
  });

  it('tracks activation with plan metadata', () => {
    render(
      <FunnelActivationTracker
        tenantId="tenant_mk"
        locale="en"
        uiV2Enabled={true}
        planId="standard"
      />
    );

    expect(mockResolveFunnelVariant).toHaveBeenCalledWith(true);
    expect(mockActivationCompleted).toHaveBeenCalledWith(
      {
        tenantId: 'tenant_mk',
        variant: 'hero_v2',
        locale: 'en',
      },
      {
        plan_id: 'standard',
      }
    );
  });
});
