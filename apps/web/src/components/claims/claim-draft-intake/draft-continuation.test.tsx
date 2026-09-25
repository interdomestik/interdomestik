import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureSaveBand } from '@/app/[locale]/components/home/free-start-intake-shell/secure-save-band';
import enFree from '@/messages/en/freeStart.json';
import sqFree from '@/messages/sq/freeStart.json';
import mkFree from '@/messages/mk/freeStart.json';
import srFree from '@/messages/sr/freeStart.json';
import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';
import { ClaimDraftIntake } from './index';
import { DraftContinuationNotice } from './draft-continuation-notice';

vi.unmock('next-intl');
const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  lookup: vi.fn(),
  submit: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  createFreeStartDraft: actions.create,
  updateFreeStartDraft: actions.update,
  deleteFreeStartDraft: actions.remove,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
}));
vi.mock('@/actions/claims/create-from-saved-draft', () => ({
  lookupSavedDraftClaim: actions.lookup,
  createClaimFromSavedDraft: actions.submit,
}));
const id = '63ffc31e-8c64-4758-995a-c57f40de7568';
const saved = {
  id,
  version: 2,
  category: 'vehicle',
  clientRequestId: id,
  createdAt: '2026-09-20T12:00:00Z',
  updatedAt: '2026-09-20T12:00:00Z',
  counterparty: 'Example insurer',
  desiredOutcome: 'repair',
  incidentDate: '2026-09-01',
  issueType: 'collision',
  resumeStep: 'preview',
  summary: 'Exact saved facts.',
};
const catalogs = {
  en: [en, enFree],
  sq: [sq, sqFree],
  mk: [mk, mkFree],
  sr: [sr, srFree],
} as const;
beforeEach(() => {
  vi.resetAllMocks();
  actions.lookup.mockResolvedValue({ claim: null });
});
afterEach(() => window.history.replaceState(null, '', '/'));

function view(locale: keyof typeof catalogs = 'en') {
  const [claims, free] = catalogs[locale];
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ ...claims, ...free, diaspora: {} }}
      timeZone="UTC"
    >
      <ClaimDraftIntake
        freeStartMessages={free}
        locale={locale}
        managerOnly
        neutralOtpHost={location.host}
        tenantId="tenant_ks"
      />
    </NextIntlClientProvider>
  );
}

describe('saved draft continuation mounted contract', () => {
  it('does not announce loading before a draft selection has been read', () => {
    const html = renderToStaticMarkup(
      <DraftContinuationNotice
        locale="en"
        continuation={{ blocked: true, canRetry: false, retry: async () => {}, state: 'initial' }}
        copy={JSON.parse(enFree.freeStart.secureSave).continuation}
      />
    );
    expect(html).toBe('');
  });
  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    'reviews exact facts in %s without granting membership or submitting',
    async locale => {
      window.history.replaceState(null, '', `/#draft=${id}`);
      actions.resume.mockResolvedValue({ ok: true, draft: saved });
      view(locale);
      await waitFor(() => expect(screen.getByTestId('claim-draft-dormant-preview')).toBeVisible());
      expect(actions.resume).toHaveBeenCalledExactlyOnceWith({ id });
      expect(screen.getByText(saved.summary)).toBeVisible();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', {
            level: 3,
            name: JSON.parse(catalogs[locale][0].claims.draftIntakeCopy).previewHeading,
          })
        ).toHaveFocus()
      );
      expect(screen.getByText(saved.counterparty)).toBeVisible();
      const copy = JSON.parse(catalogs[locale][0].claims.draftIntakeCopy);
      expect(screen.getByTestId('claim-draft-submit-disabled')).toHaveAccessibleDescription(
        copy.submitMembershipExplanation
      );
      expect(screen.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
      for (const key of ['create', 'update', 'remove', 'submit'] as const)
        expect(actions[key]).not.toHaveBeenCalled();
      expect(screen.queryByTestId('saved-draft-continue')).not.toBeInTheDocument();
    }
  );
  it.each(['notFound', 'authRequired', 'unavailableAccountContext'])(
    'does not expose or replace facts on %s and offers focused retry',
    async code => {
      window.history.replaceState(null, '', `/#draft=${id}`);
      actions.resume
        .mockResolvedValueOnce({ ok: false, code })
        .mockResolvedValueOnce({ ok: true, draft: saved });
      view();
      const alert = await screen.findByRole('alert');
      await waitFor(() => expect(alert).toHaveFocus());
      expect(screen.queryByText(saved.summary)).not.toBeInTheDocument();
      expect(screen.queryByTestId('free-start-save-open')).not.toBeInTheDocument();
      const retry = screen.getByRole('button', { name: 'Try again' });
      retry.focus();
      await userEvent.keyboard('{Enter}');
      expect(await screen.findByText(saved.summary)).toBeVisible();
      expect(actions.resume.mock.calls).toEqual([[{ id }], [{ id }]]);
      expect(actions.submit).not.toHaveBeenCalled();
    }
  );
  it('blocks all editing while the read is pending', async () => {
    window.history.replaceState(null, '', `/#draft=${id}`);
    let finish!: (value: unknown) => void;
    actions.resume.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    view();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your saved draft');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await act(async () => {
      finish({ ok: true, draft: saved });
    });
    expect(await screen.findByText(saved.summary)).toBeVisible();
  });
  it.each([
    { resumeStep: 'details' },
    { resumeStep: 'category' },
    { category: 'injury' },
    ...['issueType', 'incidentDate', 'counterparty', 'desiredOutcome', 'summary'].map(field => ({
      [field]: ' ',
    })),
  ])('refuses a draft that is no longer review-ready: %j', async changed => {
    window.history.replaceState(null, '', `/#draft=${id}`);
    actions.resume
      .mockResolvedValueOnce({ ok: true, draft: { ...saved, ...changed } })
      .mockResolvedValueOnce({ ok: true, draft: saved });
    view();
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-draft-dormant-preview')).not.toBeInTheDocument();
    expect(screen.queryByText(saved.counterparty)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(saved.summary)).toBeVisible();
    for (const key of ['create', 'update', 'remove', 'submit'] as const)
      expect(actions[key]).not.toHaveBeenCalled();
  });
  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    'offers the clean-saved public link with truthful %s copy',
    async locale => {
      const free = catalogs[locale][1];
      const copy = JSON.parse(free.freeStart.secureSave).continuation;
      const lifecycle = { active: saved, hasUnsavedChanges: false, state: 'saved' };
      const content = (
        state = 'saved',
        allowContinuation = true,
        hasUnsavedChanges = false,
        active = saved
      ) => (
        <NextIntlClientProvider locale={locale} messages={free} timeZone="UTC">
          <SecureSaveBand
            allowContinuation={allowContinuation}
            lifecycle={{ ...lifecycle, state, hasUnsavedChanges, active } as never}
            locale={locale}
            neutralOtpHost={location.host}
          />
        </NextIntlClientProvider>
      );
      const { rerender } = render(content());
      const link = await screen.findByRole('link', { name: copy.label });
      expect(link).toHaveAttribute('href', `/${locale}/member/claims/new?mode=drafts#draft=${id}`);
      expect(link).toHaveAccessibleDescription(copy.body);
      for (const state of ['loading', 'saving', 'conflict', 'error', 'deleted', 'dirty']) {
        rerender(content(state));
        expect(screen.queryByTestId('saved-draft-continue')).not.toBeInTheDocument();
      }
      for (const active of [
        { ...saved, resumeStep: 'details' },
        { ...saved, resumeStep: 'category' },
        ...['issueType', 'incidentDate', 'counterparty', 'desiredOutcome', 'summary'].map(
          field => ({ ...saved, [field]: ' ' })
        ),
      ]) {
        rerender(content('saved', true, false, active));
        expect(screen.queryByTestId('saved-draft-continue')).not.toBeInTheDocument();
      }
      rerender(content('saved', false));
      expect(screen.queryByTestId('saved-draft-continue')).not.toBeInTheDocument();
      rerender(content('saved', true, true));
      expect(screen.queryByTestId('saved-draft-continue')).not.toBeInTheDocument();
    }
  );
});
