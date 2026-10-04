/**
 * Shared setup for the focused Free Start organizer suites: the same module boundaries, locale
 * catalogs and deliberate intake journey, so each suite only holds its own assertions.
 */
import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { enFreeStartMessages, sqFreeStartMessages } from '@/messages/free-start-test-messages';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

export type LocaleId = 'en' | 'sq';
type TestUser = ReturnType<typeof userEvent.setup>;
type TestIssueId = 'water_damage' | 'landlord_dispute';
type TestOutcomeId = 'repair' | 'written_response';
type UnknownFn = (...args: unknown[]) => unknown;

export type CompleteIntakeOptions = {
  category?: 'vehicle' | 'property' | 'injury';
  counterparty?: string;
  incidentDate?: string;
  issueType?: TestIssueId;
  desiredOutcome?: TestOutcomeId;
  summary?: string;
};

const localeMessages = {
  en: { freeStart: enFreeStartMessages.freeStart },
  sq: { freeStart: sqFreeStartMessages.freeStart },
} as const;

function getTranslationValue(source: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);

  return typeof value === 'string' ? value : key;
}

export function getFreeStartMessage(locale: LocaleId, key: string): string {
  return getTranslationValue(localeMessages[locale].freeStart, key);
}

export function createFreeStartTranslationsMock(getLocale: () => LocaleId) {
  return {
    useTranslations: createUseTranslationsMock(() => ({
      common: {
        errors: {
          retry: 'Please try again. If the problem persists, contact support.',
        },
      },
      freeStart: localeMessages[getLocale()].freeStart,
    })),
  };
}

export function createRoutingLinkMock() {
  return {
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
  };
}

export function createSupportContactsMock() {
  return {
    getSupportContacts: () => ({
      telHref: 'tel:+38349900600',
    }),
  };
}

/** Keeps every real analytics contract and replaces only the completion event. */
export async function createFreeStartAnalyticsMock(freeStartCompleted: UnknownFn) {
  const actual = await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics');

  return {
    ...actual,
    CommercialFunnelEvents: {
      ...actual.CommercialFunnelEvents,
      freeStartCompleted,
    },
  };
}

export async function moveToFreeStartPreview(
  user: TestUser,
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

  // Choosing the situation opens the facts directly; there is no separate continue prerequisite.
  await user.click(screen.getByTestId(`free-start-category-${category}`));

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
}

export async function completeFreeStartIntake(
  user: TestUser,
  locale: LocaleId,
  options: CompleteIntakeOptions = {}
) {
  await moveToFreeStartPreview(user, locale, options);
  await user.click(
    screen.getByRole('button', { name: getFreeStartMessage(locale, 'preview.finish') })
  );
}

export const CATEGORY_EVIDENCE_EXPECTATIONS = [
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
