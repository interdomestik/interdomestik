import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FreeStartIntakeShell } from './index';
import { ClaimDraftIntake } from '@/components/claims/claim-draft-intake';
import enFree from '@/messages/en/freeStart.json';
import sqFree from '@/messages/sq/freeStart.json';
import mkFree from '@/messages/mk/freeStart.json';
import srFree from '@/messages/sr/freeStart.json';
import enClaims from '@/messages/en/claims.json';
import sqClaims from '@/messages/sq/claims.json';
import mkClaims from '@/messages/mk/claims.json';
import srClaims from '@/messages/sr/claims.json';
vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href}>{children}</a>
  ),
}));
const a = vi.hoisted(() => ({
  account: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  remove: vi.fn(),
  submit: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: a.account,
  createFreeStartDraft: a.create,
  updateFreeStartDraft: a.update,
  listFreeStartDrafts: a.list,
  resumeFreeStartDraft: a.resume,
  deleteFreeStartDraft: a.remove,
}));
vi.mock('@/actions/claims/create-from-saved-draft', () => ({
  createClaimFromSavedDraft: a.submit,
  lookupSavedDraftClaim: a.lookup,
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'owner-a', tenantId: 'tenant_ks' } },
      isPending: false,
    }),
  },
}));
const context = { ownerUserId: 'owner-a', tenantId: 'tenant_ks' };
const account = { emailVerified: true, expectedContext: context };
const catalogs = {
  en: [enFree, enClaims],
  sq: [sqFree, sqClaims],
  mk: [mkFree, mkClaims],
  sr: [srFree, srClaims],
} as const;
const saved = {
  category: 'vehicle' as const,
  counterparty: '',
  desiredOutcome: '' as const,
  incidentDate: '',
  issueType: '' as const,
  summary: 'Supported vehicle facts.',
  resumeStep: 'details' as const,
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  id: '22222222-2222-4222-8222-222222222222',
  version: 1,
  createdAt: '2026-10-06T15:00:00Z',
  updatedAt: '2026-10-06T15:00:00Z',
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  a.account.mockResolvedValue({ ok: true, ...account });
  a.list.mockResolvedValue({ ok: true, items: [], nextCursor: null, expectedContext: context });
  a.lookup.mockResolvedValue({ claim: null });
  a.create.mockResolvedValue({ ok: true, draft: saved });
  a.update.mockImplementation(async input => ({
    ok: true,
    draft: { ...saved, ...input, version: input.expectedVersion + 1 },
  }));
});
function view(surface: 'public' | 'member', locale: keyof typeof catalogs) {
  const [free, claims] = catalogs[locale];
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ ...free, ...claims, common: { errors: { retry: 'Retry' } }, diaspora: {} }}
      timeZone="UTC"
    >
      {surface === 'public' ? (
        <FreeStartIntakeShell
          initialCategory="vehicle"
          locale={locale}
          continueHref="/pricing"
          neutralOtpHost={location.host}
          draftAccount={account}
        />
      ) : (
        <ClaimDraftIntake
          initialCategory="vehicle"
          locale={locale}
          freeStartMessages={free}
          neutralOtpHost={location.host}
          tenantId="tenant_ks"
          managerOnly
          draftAccount={account}
        />
      )}
    </NextIntlClientProvider>
  );
}
describe('account autosave mounted public and member editors', () => {
  it.each(
    (['public', 'member'] as const).flatMap(surface =>
      (Object.keys(catalogs) as (keyof typeof catalogs)[]).map(locale => ({ surface, locale }))
    )
  )(
    'saves supported unpaid facts in $surface / $locale without OTP or focus theft',
    async ({ surface, locale }) => {
      view(surface, locale);
      const field = await screen.findByLabelText(catalogs[locale][0].freeStart.details.summary);
      field.focus();
      fireEvent.change(field, { target: { value: saved.summary } });
      await waitFor(() =>
        expect(screen.getByTestId('account-draft-status')).toHaveAttribute('data-state', 'saved')
      );
      expect(field).toHaveFocus();
      expect(a.create).toHaveBeenCalledOnce();
      expect(a.create.mock.calls[0]?.[0].expectedContext).toEqual(context);
      expect(screen.queryByTestId('free-start-save-otp')).toBeNull();
      expect(localStorage).toHaveLength(0);
      expect(a.submit).not.toHaveBeenCalled();
      fireEvent.change(field, { target: { value: 'Newer supported vehicle facts.' } });
      await waitFor(() => expect(a.update).toHaveBeenCalledOnce());
      await waitFor(() =>
        expect(screen.getByTestId('account-draft-status')).toHaveAttribute('data-state', 'saved')
      );
      expect(a.update.mock.calls[0]?.[0]).toMatchObject({
        id: saved.id,
        expectedVersion: 1,
        summary: 'Newer supported vehicle facts.',
      });
      expect(field).toHaveFocus();
      expect(a.submit).not.toHaveBeenCalled();
    }
  );
  it('keeps failure visible and retries the same immutable uncertain create after newer typing', async () => {
    a.create
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ ok: true, draft: saved });
    view('public', 'en');
    const field = await screen.findByLabelText(enFree.freeStart.details.summary);
    fireEvent.change(field, { target: { value: saved.summary } });
    const status = screen.getByTestId('account-draft-status');
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'error'));
    expect(within(status).getByRole('alert')).toHaveTextContent('could not be confirmed');
    fireEvent.change(field, { target: { value: 'Newer supported vehicle facts.' } });
    fireEvent.click(
      within(status).getByRole('button', {
        name: JSON.parse(enFree.freeStart.secureSave).saveChanges,
      })
    );
    await waitFor(() => expect(a.update).toHaveBeenCalledOnce());
    expect(a.create.mock.calls[1]?.[0]).toEqual(a.create.mock.calls[0]?.[0]);
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'saved'));
    expect(a.submit).not.toHaveBeenCalled();
  });
});
