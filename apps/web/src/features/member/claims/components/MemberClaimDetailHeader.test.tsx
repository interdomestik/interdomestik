import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMBER_CLAIM_DETAIL_SECTION_IDS,
  MemberClaimDetailHeader,
} from './MemberClaimDetailHeader';

const hoisted = vi.hoisted(() => ({
  claimEvidenceUploadDialogMock: vi.fn(
    ({ claimId, trigger }: { claimId: string; trigger: React.ReactNode }) => (
      <div data-testid="claim-evidence-upload-dialog" data-claim-id={claimId}>
        {trigger}
      </div>
    )
  ),
}));

vi.mock('./ClaimEvidenceUploadDialog', () => ({
  ClaimEvidenceUploadDialog: (props: unknown) =>
    hoisted.claimEvidenceUploadDialogMock(props as never),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      backToWorkspace: 'Back to member workspace',
      caseLabel: 'Case',
      sectionNavigation: 'Case sections',
      progress: 'Progress',
      evidence: 'Evidence',
      history: 'History',
      messages: 'Messages',
    };

    return translations[key] ?? key;
  },
}));

describe('MemberClaimDetailHeader', () => {
  beforeEach(() => {
    hoisted.claimEvidenceUploadDialogMock.mockClear();
  });

  it('keeps case identity, actions, and section destinations together', async () => {
    const user = userEvent.setup();
    const onMessage = vi.fn();
    const claimId = 'case-with-a-very-long-reference-123456789';
    const uploadAction = {
      id: 'upload',
      label: 'Upload evidence',
      variant: 'default' as const,
    };
    const messageAction = {
      id: 'message',
      label: 'Send message',
      variant: 'outline' as const,
      onClick: onMessage,
    };

    render(
      <MemberClaimDetailHeader
        claimId={claimId}
        localizedStatusLabel="Evaluation"
        secondaryActions={[messageAction]}
        status="evaluation"
        title="Delayed flight"
        uploadAction={uploadAction}
      />
    );

    const backLink = screen.getByRole('link', { name: 'Back to member workspace' });
    expect(backLink).toHaveAttribute('href', '/member');
    expect(within(backLink).getByTestId('member-claim-back-icon')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByText('Case')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delayed flight' })).toBeInTheDocument();
    expect(screen.getByText(claimId)).toBeInTheDocument();
    expect(screen.getByTestId('ops-status-badge')).toHaveTextContent('Evaluation');

    const navigation = screen.getByRole('navigation', { name: 'Case sections' });
    expect(
      within(navigation)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual([
      '#member-claim-detail-progress',
      '#member-claim-detail-evidence',
      '#member-claim-detail-history',
      '#member-claim-detail-messaging',
    ]);
    expect(Object.isFrozen(MEMBER_CLAIM_DETAIL_SECTION_IDS)).toBe(true);

    expect(screen.getByTestId('claim-evidence-upload-dialog')).toHaveAttribute(
      'data-claim-id',
      claimId
    );
    expect(hoisted.claimEvidenceUploadDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({ claimId })
    );
    expect(screen.getByTestId('member-claim-upload-icon')).toHaveAttribute('aria-hidden', 'true');

    const messageButton = screen.getByRole('button', { name: 'Send message' });
    expect(messageButton).toBeEnabled();
    await user.click(messageButton);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});
