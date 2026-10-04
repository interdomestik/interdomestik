import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enFreeStartMessages, sqFreeStartMessages } from '@/messages/free-start-test-messages';
import {
  completeFreeStartIntake,
  createFreeStartAnalyticsMock,
  createFreeStartTranslationsMock,
  createRoutingLinkMock,
  createSupportContactsMock,
  type LocaleId,
} from '@/test/free-start-organizer-harness';

const hoisted = vi.hoisted(() => ({
  freeStartCompleted: vi.fn(),
  generatePack: vi.fn(),
  submitIntake: vi.fn(),
  locale: 'en' as 'en' | 'sq',
}));

vi.mock('next-intl', () => createFreeStartTranslationsMock(() => hoisted.locale));
vi.mock('@/i18n/routing', () => createRoutingLinkMock());
vi.mock('@/lib/support-contacts', () => createSupportContactsMock());
vi.mock('@/lib/analytics', () => createFreeStartAnalyticsMock(hoisted.freeStartCompleted));
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: hoisted.submitIntake }));
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: hoisted.generatePack }));

import { FreeStartIntakeShell } from './free-start-intake-shell';

function renderFreeStart(locale: LocaleId, continueHref = '/pricing') {
  hoisted.locale = locale;
  return render(
    <FreeStartIntakeShell continueHref={continueHref} locale={locale} tenantId="tenant_public" />
  );
}

describe('FreeStartIntakeShell confidence and continuation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every assertion here is about the completed result, so this suite owns its own successful
    // intake default instead of inheriting one from a neighbouring test. The organizer derives
    // confidence and continuation from the draft, so the accepted intake echoes nothing back.
    hoisted.submitIntake.mockResolvedValue({ success: true, data: {} });
    hoisted.generatePack.mockResolvedValue({
      success: false,
      error: 'Pack generation disabled for legacy shell assertions',
      code: 'GENERATION_FAILED',
    });
  });

  it('uses the portal continuation label for authenticated non-member routes', async () => {
    const user = userEvent.setup();

    renderFreeStart('en', '/agent');

    await completeFreeStartIntake(user, 'en');

    expect(
      screen.getByRole('link', {
        name: enFreeStartMessages.freeStart.completion.cta.portal.high,
      })
    ).toHaveAttribute('href', '/agent');
  });

  it('renders the Albanian trust copy for evidence, privacy, triage, and next-step guidance', async () => {
    const user = userEvent.setup();

    renderFreeStart('sq');

    await completeFreeStartIntake(user, 'sq');

    expect(screen.getByTestId('free-start-evidence-guidance')).toHaveTextContent(
      sqFreeStartMessages.freeStart.trust.evidence.property.items.first
    );
    expect(screen.getByTestId('free-start-privacy-note')).toHaveTextContent(
      sqFreeStartMessages.freeStart.trust.privacy.badge
    );
    expect(screen.getByTestId('free-start-privacy-note')).toHaveTextContent(
      sqFreeStartMessages.freeStart.trust.privacy.body
    );
    expect(screen.getByTestId('free-start-triage-note')).toHaveTextContent(
      sqFreeStartMessages.freeStart.trust.triage.badge
    );
    expect(screen.getByTestId('free-start-triage-note')).toHaveTextContent(
      sqFreeStartMessages.freeStart.trust.triage.body
    );
    expect(screen.getByTestId('free-start-confidence-level')).toHaveTextContent(
      sqFreeStartMessages.freeStart.completion.confidence.levels.high.label
    );
    expect(screen.getByTestId('free-start-next-step')).toHaveTextContent(
      sqFreeStartMessages.freeStart.completion.nextStep.levels.high
    );
    expect(
      screen.getByRole('link', {
        name: sqFreeStartMessages.freeStart.completion.cta.membership.high,
      })
    ).toHaveAttribute('href', '/pricing');
  });

  it('returns a medium-confidence result when the intake needs document review before escalation', async () => {
    const user = userEvent.setup();

    renderFreeStart('en');

    await completeFreeStartIntake(user, 'en', {
      counterparty: 'Insurer',
      summary: 'Storm damage to the roof.',
    });

    expect(screen.getByTestId('free-start-confidence-level')).toHaveTextContent(
      enFreeStartMessages.freeStart.completion.confidence.levels.medium.label
    );
    expect(screen.getByTestId('free-start-next-step')).toHaveTextContent(
      enFreeStartMessages.freeStart.completion.nextStep.levels.medium
    );
    expect(
      screen.getByRole('link', {
        name: enFreeStartMessages.freeStart.completion.cta.membership.medium,
      })
    ).toHaveAttribute('href', '/pricing');
  });

  it('returns a low-confidence result and routes the user to the hotline when the matter looks guidance-only', async () => {
    const user = userEvent.setup();

    renderFreeStart('en');

    await completeFreeStartIntake(user, 'en', {
      counterparty: 'Landlord',
      issueType: 'landlord_dispute',
      desiredOutcome: 'written_response',
      summary: 'Dispute about repairs.',
    });

    expect(screen.getByTestId('free-start-confidence-level')).toHaveTextContent(
      enFreeStartMessages.freeStart.completion.confidence.levels.low.label
    );
    expect(screen.getByTestId('free-start-next-step')).toHaveTextContent(
      enFreeStartMessages.freeStart.completion.nextStep.levels.low
    );
    expect(
      screen.getByRole('link', {
        name: enFreeStartMessages.freeStart.completion.cta.hotline.low,
      })
    ).toHaveAttribute('href', 'tel:+38349900600');
  });
});
