import { createSupportContactsMock } from '@/test/free-start-organizer-harness';
import { createIdentityMock, resetPublicIntakeBrowser } from '@/test/public-intake-fixture';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, vi } from 'vitest';

import { freeStartLocaleMessages } from '@/messages/free-start-test-messages';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

// prettier-ignore
const boundaries = vi.hoisted(() => ({ create: vi.fn(), identity: vi.fn(), list: vi.fn(), pack: vi.fn(), remove: vi.fn(), resume: vi.fn(), submit: vi.fn(), update: vi.fn() }));
// The active locale is read per translation lookup, so one mounted suite can walk all four.
export const active = { locale: 'en' as keyof typeof freeStartLocaleMessages };
vi.mock('next-intl', () => ({
  useLocale: () => active.locale,
  useTranslations: createUseTranslationsMock(() => ({
    ...freeStartLocaleMessages[active.locale],
    common: { errors: { retry: 'Please try again.' } },
  })),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/support-contacts', () => createSupportContactsMock());
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: boundaries.submit }));
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: boundaries.pack }));
vi.mock('@/actions/free-start-drafts', () => ({
  createFreeStartDraft: boundaries.create,
  deleteFreeStartDraft: boundaries.remove,
  listFreeStartDrafts: boundaries.list,
  resumeFreeStartDraft: boundaries.resume,
  updateFreeStartDraft: boundaries.update,
}));
vi.mock('@/lib/auth-client', () => createIdentityMock(boundaries.identity));

export const en = freeStartLocaleMessages.en.freeStart;
export const secureSave = JSON.parse(en.secureSave) as {
  body: string;
  heading: string;
  privacy: string;
  continuation: { label: string };
  recovery: { status: { unavailable: string } };
};
export const recoveryCopy = secureSave.recovery;
export const VEHICLE = {
  counterparty: 'Northwind Insurance',
  desiredOutcome: 'repair',
  incidentDate: '2026-09-20',
  issueType: 'collision',
  summary: 'A van reversed into my parked car and broke the rear door.',
} as const;
const SAVED_DRAFT = {
  ...VEHICLE,
  category: 'vehicle' as const,
  clientRequestId: 'request-echoed-by-the-server',
  createdAt: '2026-09-20T09:00:00.000Z',
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  resumeStep: 'preview' as const,
  updatedAt: '2026-09-20T09:01:00.000Z',
  version: 1,
};
// prettier-ignore
export const shellProps = { continueHref: '/pricing', locale: 'en', neutralOtpHost: globalThis.location.host, tenantId: 'tenant_public' };

export function copy() {
  return freeStartLocaleMessages[active.locale].freeStart;
}

function enterFacts(category: 'injury' | 'property' | 'vehicle') {
  const issueByCategory: Record<typeof category, string> = {
    property: 'water_damage',
    injury: 'workplace_injury',
    vehicle: VEHICLE.issueType,
  };
  const issue = issueByCategory[category];
  const text = copy().details;
  fireEvent.change(screen.getByLabelText(text.issueType), { target: { value: issue } });
  fireEvent.change(screen.getByLabelText(text.incidentDate), {
    target: { value: VEHICLE.incidentDate },
  });
  fireEvent.change(screen.getByLabelText(text.counterparty), {
    target: { value: VEHICLE.counterparty },
  });
  fireEvent.change(screen.getByLabelText(text.desiredOutcome), {
    target: { value: VEHICLE.desiredOutcome },
  });
  fireEvent.change(screen.getByLabelText(text.summary), { target: { value: VEHICLE.summary } });
}

export async function reviewFacts(category: 'injury' | 'property' | 'vehicle') {
  await waitFor(() =>
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
  );
  enterFacts(category);
  fireEvent.click(screen.getByRole('button', { name: copy().details.continue }));
  await screen.findByText(VEHICLE.summary);
}

export function expectNoBoundaryReached() {
  for (const boundary of Object.values(boundaries)) expect(boundary).not.toHaveBeenCalled();
  expect(localStorage).toHaveLength(0);
}

export function setupSaveClarity() {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetPublicIntakeBrowser();
    active.locale = 'en';
    boundaries.create.mockResolvedValue({ ok: true, draft: SAVED_DRAFT, idempotent: false });
    boundaries.list.mockResolvedValue({ ok: true, items: [], nextCursor: null });
  });
}

export { boundaries };
