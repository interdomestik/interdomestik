import { render, screen } from '@testing-library/react';
import type { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/subscription.core', () => ({
  cancelSubscription: vi.fn(),
  getPaymentUpdateUrl: vi.fn(),
}));
vi.mock('@/app/[locale]/(app)/member/membership/leave-sponsorship.core', () => ({
  leaveCompanyProgramme: vi.fn(),
}));
vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('./MembershipEntityDisclosureNotice', () => ({
  MembershipEntityDisclosureNotice: () => null,
}));
import { DetailView } from './membership-detail-view';

const subscription = {
  id: 'sub',
  provider: 'paddle',
  status: 'active',
  planId: 'family',
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2027-01-01'),
  canceledAt: null,
  createdAt: new Date('2025-01-01'),
  gracePeriodEndsAt: null,
  sponsorCoverage: {
    source: 'sponsor',
    entryId: 'my-entry',
    coverageEnd: new Date('2028-01-01'),
  },
} as SubscriptionRecord;
const t = (key: string, values?: Record<string, string | number>): string =>
  values ? `${key} ${values.date}` : key;

describe('membership sponsor detail', () => {
  it('shows coverage end and leave while hiding payment and cancellation actions', () => {
    render(<DetailView subscription={subscription} documents={[]} t={t} />);
    expect(screen.getByTestId('membership-sponsor-coverage')).toHaveTextContent(
      'sponsorCoverage.covered_until'
    );
    expect(screen.getByTestId('membership-sponsor-coverage')).toHaveTextContent('2028');
    expect(screen.getByTestId('membership-current-period-end')).toHaveTextContent('2026');
    expect(screen.getByTestId('membership-current-period-end')).toHaveTextContent('2027');
    expect(screen.getByRole('button', { name: 'sponsorCoverage.leave' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'dunning.update_payment_button' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'actions.cancel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'actions.renew' })).toBeNull();
    expect(screen.queryByTestId('membership-grace-deadline')).toBeNull();
  });
});
