import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enFreeStartMessages from '@/messages/en/freeStart.json';
import sqFreeStartMessages from '@/messages/sq/freeStart.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const hoisted = vi.hoisted(() => ({
  freeStartCompletedMock: vi.fn(),
  submitFreeStartIntakeMock: vi.fn(),
  currentLocale: 'en' as 'en' | 'sq',
}));

const localeMessages = {
  en: {
    freeStart: enFreeStartMessages.freeStart,
  },
  sq: {
    freeStart: sqFreeStartMessages.freeStart,
  },
} as const;

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    common: {
      errors: {
        retry: 'Please try again. If the problem persists, contact support.',
      },
    },
    freeStart: localeMessages[hoisted.currentLocale].freeStart,
  })),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: () => ({
    telHref: 'tel:+38349900600',
  }),
}));

vi.mock('@/lib/analytics', async () => {
  const actual = await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics');

  return {
    ...actual,
    CommercialFunnelEvents: {
      ...actual.CommercialFunnelEvents,
      freeStartCompleted: hoisted.freeStartCompletedMock,
    },
  };
});

vi.mock('@/actions/free-start', () => ({
  submitFreeStartIntake: (...args: [unknown]) => hoisted.submitFreeStartIntakeMock(...args),
}));

import { FreeStartIntakeShell } from './free-start-intake-shell';

type LocaleId = keyof typeof localeMessages;
type TestIssueId = 'water_damage' | 'landlord_dispute';
type TestOutcomeId = 'repair' | 'written_response';

type CompleteIntakeOptions = {
  category?: 'vehicle' | 'property' | 'injury';
  counterparty?: string;
  incidentDate?: string;
  issueType?: TestIssueId;
  desiredOutcome?: TestOutcomeId;
  summary?: string;
};

function getTranslationValue(source: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);

  return typeof value === 'string' ? value : key;
}

function getFreeStartMessage(locale: LocaleId, key: string): string {
  return getTranslationValue(localeMessages[locale].freeStart, key);
}

async function completeFreeStartIntake(
  user: ReturnType<typeof userEvent.setup>,
  locale: LocaleId,
  options: CompleteIntakeOptions = {}
) {
  const {
    category = 'property',
    counterparty = 'Building insurer',
    incidentDate = '2026-03-01',
    issueType = 'water_damage',
    desiredOutcome = 'repair',
    summary = 'Water entered through the roof after a storm and damaged two rooms.',
  } = options;

  await user.click(screen.getByTestId(`free-start-category-${category}`));
  await user.click(
    screen.getByRole('button', { name: getFreeStartMessage(locale, 'choose.continue') })
  );

  await user.selectOptions(
    screen.getByLabelText(getFreeStartMessage(locale, 'details.issueType')),
    issueType
  );
  await user.type(
    screen.getByLabelText(getFreeStartMessage(locale, 'details.incidentDate')),
    incidentDate
  );
  await user.type(
    screen.getByLabelText(getFreeStartMessage(locale, 'details.counterparty')),
    counterparty
  );
  await user.selectOptions(
    screen.getByLabelText(getFreeStartMessage(locale, 'details.desiredOutcome')),
    desiredOutcome
  );
  await user.type(screen.getByLabelText(getFreeStartMessage(locale, 'details.summary')), summary);
  await user.click(
    screen.getByRole('button', { name: getFreeStartMessage(locale, 'details.continue') })
  );
  await user.click(
    screen.getByRole('button', { name: getFreeStartMessage(locale, 'preview.finish') })
  );
}

const CATEGORY_EVIDENCE_EXPECTATIONS = [
  {
    category: 'vehicle',
    evidencePrompt: enFreeStartMessages.freeStart.trust.evidence.vehicle.items.first,
  },
  {
    category: 'property',
    evidencePrompt: enFreeStartMessages.freeStart.trust.evidence.property.items.first,
  },
  {
    category: 'injury',
    evidencePrompt: enFreeStartMessages.freeStart.trust.evidence.injury.items.first,
  },
] as const;

function renderFreeStart(locale: LocaleId, continueHref = '/register') {
  hoisted.currentLocale = locale;
  return render(
    <FreeStartIntakeShell continueHref={continueHref} locale={locale} tenantId="tenant_public" />
  );
}

describe('FreeStartIntakeShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the three launch categories before the guided intake starts', () => {
    renderFreeStart('en');

    expect(screen.getByTestId('free-start-category-vehicle')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-property')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-injury')).toBeInTheDocument();
  });

  it('lets a public user complete the intake path and generates a pack shell summary', async () => {
    const user = userEvent.setup();
    hoisted.submitFreeStartIntakeMock.mockResolvedValue({
      success: true,
      data: {
        claimCategory: 'property',
        desiredOutcome: 'repair',
        intakeIssue: 'water_damage',
      },
    });

    renderFreeStart('en');

    await completeFreeStartIntake(user, 'en');

    expect(screen.getByTestId('free-start-complete')).toBeInTheDocument();
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
    ).toHaveAttribute('href', '/register');
    expect(hoisted.submitFreeStartIntakeMock).toHaveBeenCalledWith({
      category: 'property',
      counterparty: 'Building insurer',
      desiredOutcome: 'repair',
      incidentDate: '2026-03-01',
      issueType: 'water_damage',
      summary: 'Water entered through the roof after a storm and damaged two rooms.',
    });
    expect(hoisted.freeStartCompletedMock).toHaveBeenCalledWith(
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

  it.each(CATEGORY_EVIDENCE_EXPECTATIONS)(
    'shows category-specific evidence guidance for $category claims in the wizard',
    async ({ category, evidencePrompt }) => {
      const user = userEvent.setup();

      renderFreeStart('en');

      await user.click(screen.getByTestId(`free-start-category-${category}`));

      expect(screen.getByTestId('free-start-evidence-guidance')).toHaveTextContent(evidencePrompt);
    }
  );

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
    ).toHaveAttribute('href', '/register');
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
    ).toHaveAttribute('href', '/register');
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
