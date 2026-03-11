import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  messages: {
    trust: {
      activeMembers: 'Active Members',
      activeMembersValue: '8,500+',
      memberSavings: 'Member Savings',
      memberSavingsValue: 'EUR150K+',
      successRate: 'Success Rate',
      successRateValue: '94%',
      hotlineResponse: 'Hotline Response',
      hotlineResponseValue: '<60s',
      trustCuesLabel: 'Claim-first trust cues',
      trustCues: [
        'Vehicle • Property • Injury',
        'Phone + WhatsApp support',
        'Shqip / English support',
      ],
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const resolve = (key?: string) => {
      const path = [namespace, key].filter(Boolean).join('.').split('.');
      return path.reduce<unknown>((value, segment) => {
        if (value && typeof value === 'object' && segment in value) {
          return (value as Record<string, unknown>)[segment];
        }
        return undefined;
      }, hoisted.messages);
    };

    const translate = (key: string) => {
      const value = resolve(key);
      return typeof value === 'string' ? value : key;
    };

    translate.raw = (key: string) => resolve(key);

    return translate;
  },
}));

vi.mock('@/lib/flags', () => ({
  flags: {
    responseSla: true,
  },
}));

import { TrustStrip } from './trust-strip';

describe('TrustStrip', () => {
  it('renders trust stats and claim-first cue chips', () => {
    render(<TrustStrip />);

    expect(screen.getByText('8,500+')).toBeInTheDocument();
    expect(screen.getByText('<60s')).toBeInTheDocument();
    expect(screen.getByText('Claim-first trust cues')).toBeInTheDocument();
    expect(screen.getAllByTestId('trust-strip-cue-chip')).toHaveLength(3);
    expect(screen.getByText('Shqip / English support')).toBeInTheDocument();
  });
});
