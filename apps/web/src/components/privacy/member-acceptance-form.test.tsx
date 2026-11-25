import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemberAcceptanceForm } from './member-acceptance-form';

const mocks = vi.hoisted(() => ({ accept: vi.fn(), refresh: vi.fn(), signOut: vi.fn() }));
vi.mock('@/actions/privacy/accept-legal-documents', () => ({
  acceptLegalDocuments: mocks.accept,
}));
vi.mock('@/components/settings/language-settings', () => ({ LanguageSettings: () => null }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: vi.fn() } }));
vi.mock('@/lib/auth/logout', () => ({ signOutAndRedirectToLogin: mocks.signOut }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const terms = {
  kind: 'terms',
  version: 'v1',
  blocks: [{ key: 'title', text: 'Legal review pending. Terms.' }],
} as const;
const notice = {
  kind: 'privacy_notice',
  version: 'v1',
  blocks: [{ key: 'title', text: 'Legal review pending. Privacy notice.' }],
} as const;

beforeEach(() => {
  mocks.accept.mockReset();
  mocks.refresh.mockReset();
  mocks.signOut.mockReset();
});

it('focuses the heading and requires every displayed attestation before continuing', async () => {
  mocks.accept.mockResolvedValue({ success: true });
  render(
    <MemberAcceptanceForm
      formToken="signed-form"
      locale="en"
      texts={[terms, notice]}
      pendingKinds={['terms']}
    />
  );
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  const submit = screen.getByRole('button', { name: 'continue' });
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'acceptTerms' }));
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'acknowledgePrivacyNotice' }));
  fireEvent.click(submit);

  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.accept).toHaveBeenCalledExactlyOnceWith({
    formToken: 'signed-form',
    locale: 'en',
    documents: [
      { kind: 'terms', version: 'v1' },
      { kind: 'privacy_notice', version: 'v1' },
    ],
    attestations: { termsAccepted: true, privacyNoticeAcknowledged: true },
  });

  await screen.findByText('openError');
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(mocks.refresh).toHaveBeenCalledTimes(2);
  expect(mocks.accept).toHaveBeenCalledOnce();
});

it('preserves the only missing attestation during save recovery', async () => {
  let finishSave: (result: { success: false }) => void = () => undefined;
  const save = new Promise<{ success: false }>(resolve => {
    finishSave = resolve;
  });
  mocks.accept.mockReturnValueOnce(save);
  render(
    <MemberAcceptanceForm formToken="signed-form" locale="en" texts={[notice]} pendingKinds={[]} />
  );
  const check = screen.getByRole('checkbox', { name: 'acknowledgePrivacyNotice' });
  expect(screen.getAllByRole('checkbox')).toEqual([check]);
  fireEvent.click(check);
  fireEvent.click(screen.getByRole('button', { name: 'continue' }));
  expect(screen.getByRole('button', { name: 'saving' })).toBeDisabled();
  expect(check).toBeDisabled();
  await act(() => {
    finishSave({ success: false });
    return save;
  });
  expect(screen.getByRole('alert')).toHaveTextContent('saveError');
  expect(check).toBeChecked();
  expect(screen.getByRole('button', { name: 'retry' })).toBeEnabled();
  expect(mocks.accept).toHaveBeenCalledExactlyOnceWith({
    formToken: 'signed-form',
    locale: 'en',
    documents: [{ kind: 'privacy_notice', version: 'v1' }],
    attestations: { termsAccepted: undefined, privacyNoticeAcknowledged: true },
  });
});

it('clears and locks stale confirmations until new text is rendered', async () => {
  mocks.accept.mockResolvedValue({ success: false, code: 'stale_version' });
  render(
    <MemberAcceptanceForm
      formToken="signed-form"
      locale="en"
      texts={[terms]}
      pendingKinds={['terms']}
    />
  );
  const check = screen.getByRole('checkbox', { name: 'acceptTerms' });
  fireEvent.click(check);
  fireEvent.click(screen.getByRole('button', { name: 'continue' }));
  await waitFor(() => expect(screen.getByText('stale')).toHaveFocus());
  expect(check).not.toBeChecked();
  expect(check).toBeDisabled();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it.each([
  ['legal_text_not_approved', 'pendingApproval'],
  ['legal_text_mismatch', 'unavailable'],
] as const)('withholds all checkboxes on %s', (unavailable, message) => {
  render(
    <MemberAcceptanceForm
      formToken="signed-form"
      locale="en"
      texts={[]}
      pendingKinds={[]}
      unavailable={unavailable}
    />
  );
  expect(screen.getByRole('status')).toHaveTextContent(message);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'continue' })).not.toBeInTheDocument();
});
