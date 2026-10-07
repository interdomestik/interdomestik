import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import { ClaimDraftIntake } from './index';
import enFree from '@/messages/en/freeStart.json';
import enClaims from '@/messages/en/claims.json';
vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href}>{children}</a>
  ),
}));
const a = vi.hoisted(() => ({
  session: {
    data: { user: { id: 'owner-a', tenantId: 'tenant_ks' } } as {
      user: { id: string; tenantId: string };
    } | null,
    isPending: false,
  },
  account: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  remove: vi.fn(),
  submit: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => a.session } }));
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
const initial = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const other = {
  ...initial,
  expectedContext: { ...initial.expectedContext, ownerUserId: 'owner-b' },
};
function view(account = initial) {
  return (
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={{ ...enFree, ...enClaims, common: { errors: { retry: 'Retry' } }, diaspora: {} }}
    >
      <ClaimDraftIntake
        locale="en"
        tenantId="tenant_ks"
        initialCategory="vehicle"
        draftAccount={account}
        freeStartMessages={enFree}
        neutralOtpHost={location.host}
      />
    </NextIntlClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  a.session = { data: { user: { id: 'owner-a', tenantId: 'tenant_ks' } }, isPending: false };
  a.account.mockResolvedValue({ ok: true, ...initial });
  a.list.mockImplementation(async input => ({
    ok: true,
    items: [],
    nextCursor: null,
    expectedContext: input.expectedContext,
  }));
  a.lookup.mockResolvedValue({ claim: null });
  a.create.mockImplementation(async input => ({
    ok: true,
    draft: {
      counterparty: '',
      desiredOutcome: '',
      incidentDate: '',
      issueType: '',
      ...input,
      id: '22222222-2222-4222-8222-222222222222',
      version: 1,
      createdAt: '2026-10-06T15:00:00Z',
      updatedAt: '2026-10-06T15:00:00Z',
    },
  }));
});
it.each([false, true])(
  'keeps B facts and context on a pending refresh (current B present=%s), then clears confirmed logout',
  async present => {
    const tree = render(view());
    await screen.findByTestId('account-draft-status');
    a.session = { data: { user: { id: 'owner-b', tenantId: 'tenant_ks' } }, isPending: false };
    a.account.mockResolvedValue({ ok: true, ...other });
    tree.rerender(view());
    await waitFor(() =>
      expect(a.list).toHaveBeenCalledWith(
        expect.objectContaining({ expectedContext: other.expectedContext })
      )
    );
    const field = await screen.findByLabelText(enFree.freeStart.details.summary);
    fireEvent.change(field, { target: { value: 'Owner B supported vehicle facts.' } });
    await waitFor(() =>
      expect(screen.getByTestId('account-draft-status')).toHaveAttribute('data-state', 'saved')
    );
    expect(a.create.mock.calls.at(-1)?.[0].expectedContext).toEqual(other.expectedContext);
    a.session = {
      data: present ? { user: { id: 'owner-b', tenantId: 'tenant_ks' } } : null,
      isPending: true,
    };
    tree.rerender(view());
    await waitFor(() =>
      expect(screen.getByLabelText(enFree.freeStart.details.summary)).toHaveValue(
        'Owner B supported vehicle facts.'
      )
    );
    expect(screen.getByTestId('account-draft-status')).toHaveAttribute('data-state', 'saved');
    expect(a.create).toHaveBeenCalledOnce();
    expect(a.submit).not.toHaveBeenCalled();
    a.session = { data: null, isPending: false };
    tree.rerender(view());
    expect(screen.queryByTestId('account-draft-status')).toBeNull();
    expect(screen.queryByDisplayValue('Owner B supported vehicle facts.')).toBeNull();
  }
);

it('shows successful same-owner manual reads without granting unverified writes', async () => {
  const unverified = { ...initial, emailVerified: false };
  const row = {
    category: 'vehicle',
    counterparty: '',
    desiredOutcome: '',
    incidentDate: '',
    issueType: '',
    summary: 'Existing owner facts.',
    resumeStep: 'details',
    id: '22222222-2222-4222-8222-222222222222',
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    version: 1,
    createdAt: '2026-10-06T15:00:00Z',
    updatedAt: '2026-10-06T15:00:00Z',
  };
  a.account.mockResolvedValue({ ok: true, ...unverified });
  a.list.mockResolvedValue({
    ok: true,
    items: [row],
    nextCursor: null,
    expectedContext: initial.expectedContext,
  });
  a.resume.mockResolvedValue({ ok: true, draft: row, expectedContext: initial.expectedContext });
  render(view(unverified));
  fireEvent.click(screen.getByTestId('free-start-manage-open'));
  const item = await screen.findByTestId(`free-start-draft-${row.id}`);
  expect(item).toHaveTextContent('Existing owner facts.');
  expect(screen.queryByTestId('free-start-save-email')).toBeNull();
  fireEvent.click(screen.getByTestId(`free-start-resume-${row.id}`));
  await screen.findByDisplayValue('Existing owner facts.');
  expect(a.create).not.toHaveBeenCalled();
  expect(a.update).not.toHaveBeenCalled();
});
