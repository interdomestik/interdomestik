import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DraftClaimHandoff } from './draft-claim-handoff';
import type { SavedDraft } from './types';

const actions = vi.hoisted(() => ({ confirm: vi.fn(), review: vi.fn() }));

vi.mock('@/actions/free-start-drafts/handoff.core', () => ({
  confirmFreeStartDraftHandoff: actions.confirm,
  reviewFreeStartDraftHandoff: actions.review,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => {
    const t = ((key: string) => key) as ((key: string) => string) & { raw: () => string };
    t.raw = () =>
      JSON.stringify({
        handoff: {
          action: 'Review and create claim',
          alreadyCreated: 'A claim was already created from this saved draft.',
          authorityTruth: 'Only your current membership can create the claim.',
          claimLink: 'Open claim',
          confirm: 'Create claim',
          confirming: 'Creating claim',
          created: 'Claim created. The saved draft is unchanged.',
          deleteIndependent: 'Deleting the draft will not delete the claim.',
          draftChanged: 'The draft changed. Review it again.',
          facts: {
            category: 'Category',
            counterparty: 'Other party',
            desiredOutcome: 'Requested outcome',
            incidentDate: 'Incident date',
            issueType: 'Issue',
            summary: 'Summary',
          },
          heading: 'Review saved facts',
          intro: 'These facts will be copied into a claim.',
          membershipRequired: 'Membership required.',
          sourceRetained: 'The saved draft remains unchanged.',
          unavailable: 'Unavailable.',
        },
      });
    return t;
  },
}));

const draft: SavedDraft = {
  category: 'property',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  counterparty: 'Insurer',
  createdAt: '2026-07-18T02:00:00.000Z',
  desiredOutcome: 'repair',
  id: '22222222-2222-4222-8222-222222222222',
  incidentDate: '2026-03-01',
  issueType: 'water_damage',
  resumeStep: 'preview',
  summary: 'Water damaged two rooms.',
  updatedAt: '2026-07-18T02:00:00.000Z',
  version: 1,
};

describe('DraftClaimHandoff', () => {
  it('shows already-created copy when review finds an existing linked claim', async () => {
    actions.review.mockResolvedValue({
      ok: true,
      claimId: '33333333-3333-4333-8333-333333333333',
      facts: {
        category: 'property',
        counterparty: 'Insurer',
        desiredOutcome: 'repair',
        incidentDate: '2026-03-01',
        issueType: 'water_damage',
        summary: 'Water damaged two rooms.',
        version: 1,
      },
    });

    render(<DraftClaimHandoff draft={draft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review and create claim' }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'A claim was already created from this saved draft.' })
      ).toBeVisible()
    );
    expect(
      screen.queryByText('Claim created. The saved draft is unchanged.')
    ).not.toBeInTheDocument();
  });

  it('recovers from rejected review actions with bounded unavailable copy', async () => {
    actions.review.mockRejectedValue(new Error('network'));

    render(<DraftClaimHandoff draft={draft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review and create claim' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unavailable.'));
    expect(screen.getByRole('button', { name: 'Review and create claim' })).not.toBeDisabled();
  });
});
