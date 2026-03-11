import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import enFreeStartMessages from '@/messages/en/freeStart.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const hoisted = vi.hoisted(() => ({
  freeStartCompletedMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    freeStart: enFreeStartMessages.freeStart,
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

import { FreeStartIntakeShell } from './free-start-intake-shell';

type CompleteIntakeOptions = {
  category?: 'vehicle' | 'property' | 'injury';
  counterparty?: string;
  incidentDate?: string;
  issueType?: string;
  desiredOutcome?: string;
  summary?: string;
};

async function completeFreeStartIntake(
  user: ReturnType<typeof userEvent.setup>,
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
  await user.click(screen.getByRole('button', { name: 'Continue to guided intake' }));

  await user.selectOptions(screen.getByLabelText('What happened?'), issueType);
  await user.type(screen.getByLabelText('When did it happen?'), incidentDate);
  await user.type(screen.getByLabelText('Who are you dealing with?'), counterparty);
  await user.selectOptions(screen.getByLabelText('What do you want to recover?'), desiredOutcome);
  await user.type(screen.getByLabelText('Brief summary'), summary);
  await user.click(screen.getByRole('button', { name: 'Preview your Free Start pack' }));
  await user.click(screen.getByRole('button', { name: 'Finish Free Start' }));
}

describe('FreeStartIntakeShell', () => {
  it('shows the three launch categories before the guided intake starts', () => {
    render(<FreeStartIntakeShell continueHref="/register" locale="en" tenantId="tenant_public" />);

    expect(screen.getByTestId('free-start-category-vehicle')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-property')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-injury')).toBeInTheDocument();
  });

  it('lets a public user complete the intake path and generates a pack shell summary', async () => {
    const user = userEvent.setup();

    render(<FreeStartIntakeShell continueHref="/register" locale="en" tenantId="tenant_public" />);

    await completeFreeStartIntake(user);

    expect(screen.getByTestId('free-start-complete')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-confidence-level')).toHaveTextContent('High');
    expect(screen.getByTestId('free-start-next-step')).toHaveTextContent(
      'Join Asistenca for human triage within 24 business hours.'
    );
    expect(screen.getByText('Property damage')).toBeInTheDocument();
    expect(screen.getByText('Water damage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Join Asistenca for human triage' })).toHaveAttribute(
      'href',
      '/register'
    );
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

  it('uses the portal continuation label for authenticated non-member routes', async () => {
    const user = userEvent.setup();

    render(<FreeStartIntakeShell continueHref="/agent" locale="en" tenantId="tenant_public" />);

    await completeFreeStartIntake(user);

    expect(screen.getByRole('link', { name: 'Continue in the portal for review' })).toHaveAttribute(
      'href',
      '/agent'
    );
  });

  it('returns a medium-confidence result when the intake needs document review before escalation', async () => {
    const user = userEvent.setup();

    render(<FreeStartIntakeShell continueHref="/register" locale="en" tenantId="tenant_public" />);

    await completeFreeStartIntake(user, {
      counterparty: 'Insurer',
      summary: 'Storm damage to the roof.',
    });

    expect(screen.getByTestId('free-start-confidence-level')).toHaveTextContent('Medium');
    expect(screen.getByTestId('free-start-next-step')).toHaveTextContent(
      'Upgrade for document review before you send the first complaint or notice.'
    );
    expect(screen.getByRole('link', { name: 'Upgrade for document review' })).toHaveAttribute(
      'href',
      '/register'
    );
  });

  it('returns a low-confidence result and routes the user to the hotline when the matter looks guidance-only', async () => {
    const user = userEvent.setup();

    render(<FreeStartIntakeShell continueHref="/register" locale="en" tenantId="tenant_public" />);

    await completeFreeStartIntake(user, {
      counterparty: 'Landlord',
      issueType: 'landlord_dispute',
      desiredOutcome: 'written_response',
      summary: 'Dispute about repairs.',
    });

    expect(screen.getByTestId('free-start-confidence-level')).toHaveTextContent('Low');
    expect(screen.getByTestId('free-start-next-step')).toHaveTextContent(
      'Use the hotline for routing support and the clearest next step before you escalate.'
    );
    expect(
      screen.getByRole('link', { name: 'Call the hotline for next-step guidance' })
    ).toHaveAttribute('href', 'tel:+38349900600');
  });
});
