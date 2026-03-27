import { getAgentReferralLink } from '@/actions/referrals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MockButton,
  MockCard,
  MockCardContent,
  MockCardHeader,
  MockCardTitle,
  MockInput,
  MockSkeleton,
} from '@/test/referral-card-test-mocks';

import { ReferralLinkCard } from './referral-link-card';

vi.mock('@/actions/referrals', () => ({
  getAgentReferralLink: vi.fn(),
}));

vi.mock('@/lib/public-links', () => ({
  normalizePublicLink: (link: string) =>
    link.replace('http://localhost:3000', 'http://mk.127.0.0.1.nip.io:3000'),
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: MockButton,
}));

vi.mock('@interdomestik/ui/components/card', () => ({
  Card: MockCard,
  CardContent: MockCardContent,
  CardHeader: MockCardHeader,
  CardTitle: MockCardTitle,
}));

vi.mock('@interdomestik/ui/components/input', () => ({
  Input: MockInput,
}));

vi.mock('@interdomestik/ui/components/skeleton', () => ({
  Skeleton: MockSkeleton,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Your referral link',
      description: 'Share this link to earn commissions for new memberships.',
      loadError: 'Failed to load referral link',
      copied: 'Link copied!',
      copyError: 'Failed to copy link',
    };

    return translations[key] ?? key;
  },
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

describe('ReferralLinkCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    vi.mocked(getAgentReferralLink).mockResolvedValue({
      success: true,
      data: {
        code: 'STEFAN-GMV1SU',
        link: 'http://localhost:3000?ref=STEFAN-GMV1SU',
      },
      error: undefined,
      fieldErrors: undefined,
    });
  });

  it('normalizes the displayed link to the live origin', async () => {
    render(<ReferralLinkCard />);

    expect(
      await screen.findByDisplayValue('http://mk.127.0.0.1.nip.io:3000?ref=STEFAN-GMV1SU')
    ).toBeInTheDocument();
  });

  it('copies the normalized link instead of the localhost fallback', async () => {
    render(<ReferralLinkCard />);

    const copyButton = await screen.findByRole('button');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'http://mk.127.0.0.1.nip.io:3000?ref=STEFAN-GMV1SU'
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith('Link copied!');
    expect(toastError).not.toHaveBeenCalled();
  });
});
