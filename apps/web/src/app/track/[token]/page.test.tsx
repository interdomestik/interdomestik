import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPublicClaimStatus: vi.fn(),
  headers: vi.fn(),
  loadMessagesForNamespaces: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/features/claims/tracking/server/getPublicClaimStatus', () => ({
  getPublicClaimStatus: mocks.getPublicClaimStatus,
}));
vi.mock('@/i18n/messages', () => ({
  loadMessagesForNamespaces: mocks.loadMessagesForNamespaces,
}));
vi.mock('@/features/claims/tracking/components/PublicTrackingCard', () => ({
  PublicTrackingCard: ({ data }: { data: { claimId: string } }) => <p>{data.claimId}</p>,
}));
vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));

import PublicTrackingPage from './page';

const props = {
  params: Promise.resolve({ token: 'tracking-token' }),
  searchParams: Promise.resolve({ lang: 'en' }),
};

describe('PublicTrackingPage', () => {
  beforeEach(() => {
    vi.stubEnv('INTERDOMESTIK_BUILD_COPYRIGHT_YEAR', '2037');
    mocks.headers.mockResolvedValue({
      get: (name: string) => (name === 'user-agent' ? 'test-agent' : null),
    });
    mocks.getPublicClaimStatus.mockResolvedValue({
      claimId: 'claim-123',
      status: 'submitted',
      statusLabelKey: 'status.submitted',
      lastUpdatedAt: new Date('2036-12-31T23:59:59Z'),
      nextStepKey: 'step.evaluation',
    });
    mocks.loadMessagesForNamespaces.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('renders request-bound status and the compiled artifact year in server-visible HTML', async () => {
    render((await PublicTrackingPage(props)) as ReactNode);

    expect(screen.getByText('claim-123')).toBeInTheDocument();
    expect(screen.getByText(/© 2037 Interdomestik/u)).toBeInTheDocument();
  });
});
