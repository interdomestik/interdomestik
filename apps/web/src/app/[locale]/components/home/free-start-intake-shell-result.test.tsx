import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enFreeStartMessages } from '@/messages/free-start-test-messages';
import { createGeneratedClaimPackFixture } from '@/test/free-start-claim-pack-fixture';
import { completeFreeStartIntake } from '@/test/free-start-organizer-harness';

import { getFreeStartShellBoundary, renderFreeStart } from '@/test/free-start-shell-fixture';

const hoisted = getFreeStartShellBoundary();

function mockSuccessfulGeneratedClaimPack() {
  hoisted.submitIntake.mockResolvedValue({
    success: true,
    data: {
      claimCategory: 'property',
      desiredOutcome: 'repair',
      intakeIssue: 'water_damage',
    },
  });
  hoisted.generatePack.mockResolvedValue({
    success: true,
    data: createGeneratedClaimPackFixture(),
  });
}

describe('FreeStartIntakeShell result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.generatePack.mockResolvedValue({
      success: false,
      error: 'Pack generation disabled for legacy shell assertions',
      code: 'GENERATION_FAILED',
    });
  });

  it('lets a public user complete the intake path and generates a pack shell summary', async () => {
    const user = userEvent.setup();
    hoisted.submitIntake.mockResolvedValue({
      success: true,
      data: {
        claimCategory: 'property',
        desiredOutcome: 'repair',
        intakeIssue: 'water_damage',
      },
    });

    renderFreeStart('en');

    await completeFreeStartIntake(user, 'en');

    expect(screen.getByTestId('free-start-complete-pending-pack')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-confidence-level')).toHaveTextContent(
      enFreeStartMessages.freeStart.completion.confidence.levels.high.label
    );
    expect(screen.getByTestId('free-start-next-step')).toHaveTextContent(
      enFreeStartMessages.freeStart.completion.nextStep.levels.high
    );
    expect(
      screen.getByText(enFreeStartMessages.freeStart.categories.property.title)
    ).toBeInTheDocument();
    expect(
      screen.getByText(enFreeStartMessages.freeStart.issues.property.water_damage)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: enFreeStartMessages.freeStart.completion.cta.membership.high,
      })
    ).toHaveAttribute('href', '/pricing');
    expect(hoisted.submitIntake).toHaveBeenCalledWith(
      {
        category: 'property',
        counterparty: 'Building insurer',
        desiredOutcome: 'repair',
        incidentDate: '2026-03-01',
        issueType: 'water_damage',
        summary: 'Water entered through the roof after a storm and damaged two rooms.',
      },
      expect.any(String)
    );
    expect(hoisted.freeStartCompleted).toHaveBeenCalledWith(
      {
        locale: 'en',
        tenantId: 'tenant_public',
        variant: 'hero_v2',
      },
      expect.objectContaining({
        claim_category: 'property',
        intake_issue: 'water_damage',
      })
    );
  });

  it('renders the generated claim pack when the pack action succeeds', async () => {
    const user = userEvent.setup();
    mockSuccessfulGeneratedClaimPack();

    renderFreeStart('en', '/member/claims/new');
    expect(screen.getByTestId('free-start-result-announcement')).toBeEmptyDOMElement();

    await completeFreeStartIntake(user, 'en');

    expect(await screen.findByTestId('claim-pack-result')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-result-announcement')).toHaveTextContent(
      'Your temporary Free Start result is ready.'
    );
    expect(screen.getByTestId('free-start-complete')).toHaveAttribute('data-layout', 'full-width');
    expect(screen.getByRole('heading', { name: 'Your temporary result is ready.' })).toBeVisible();
    expect(screen.queryByText('Review your Free Start pack shell.')).not.toBeInTheDocument();
    expect(screen.getByTestId('claim-pack-letter')).toHaveTextContent(
      'Draft property damage letter'
    );
    expect(screen.getByTestId('claim-pack-next-step')).not.toHaveTextContent('human triage');
    expect(screen.getByRole('link', { name: /continue in member claims/i })).toHaveAttribute(
      'href',
      '/member/claims/new'
    );
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });

  it('shows privacy notice and triage timing in the completed flow without changing the T03 outcome guidance', async () => {
    const user = userEvent.setup();

    renderFreeStart('en');

    await completeFreeStartIntake(user, 'en');

    expect(screen.getByTestId('free-start-evidence-guidance')).toHaveTextContent(
      enFreeStartMessages.freeStart.trust.evidence.property.items.first
    );
    expect(screen.getByTestId('free-start-privacy-note')).toHaveTextContent(
      enFreeStartMessages.freeStart.trust.privacy.badge
    );
    expect(screen.getByTestId('free-start-privacy-note')).toHaveTextContent(
      enFreeStartMessages.freeStart.trust.privacy.body
    );
    expect(screen.getByTestId('free-start-triage-note')).toHaveTextContent(
      enFreeStartMessages.freeStart.trust.triage.badge
    );
    expect(screen.getByTestId('free-start-triage-note')).toHaveTextContent('24 business hours');
    expect(screen.getByTestId('free-start-triage-note')).toHaveTextContent(
      enFreeStartMessages.freeStart.trust.triage.body
    );
    expect(screen.getByTestId('free-start-next-step')).toHaveTextContent(
      enFreeStartMessages.freeStart.completion.nextStep.levels.high
    );
  });
});
