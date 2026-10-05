import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { DormantPreview } from './dormant-preview';
const h = vi.hoisted(() => ({
  lookup: vi.fn(),
  submit: vi.fn(),
  monitor: vi.fn(),
  outcome: vi.fn(),
}));
vi.mock('@/lib/observability/critical-action', () => ({ startCriticalAction: h.monitor }));
vi.mock('@/actions/claims/create-from-saved-draft', () => ({
  createClaimFromSavedDraft: h.submit,
  lookupSavedDraftClaim: h.lookup,
}));
vi.mock('next-intl', () => ({ useLocale: () => 'en' }));
const draft = {
  counterparty: 'Example Insurer',
  desiredOutcome: 'repair' as const,
  incidentDate: '2026-07-20',
  issueType: 'collision' as const,
  summary: 'The vehicle was damaged and needs repair.',
};
// prettier-ignore
const copy = { backToDetails: 'Back', categoryBody: 'Body', categoryContinue: 'Continue', categoryHeading: 'Category', existingCaseSuccess: 'There is already a submitted case for this saved draft.', heading: 'Draft', previewBody: 'Review', previewHeading: 'Review facts', submitDisabled: 'Not available', submitExplanation: 'Save a complete draft first.', submitFirstSaveExplanation: 'Save this complete draft first. Submitting also requires active membership. Saving the draft does not submit the claim.', submitIncompleteExplanation: 'Complete and save the draft before submitting.', submitMembershipExplanation: 'To submit a claim, you need an active membership. You can keep managing this saved draft; saving it does not submit the claim.', submitUnsavedExplanation: 'Save your changes before submitting. Saving changes does not submit the claim.', supporting: 'Support', truth: 'Draft truth', unsupported: 'Unsupported' };
// prettier-ignore
const submitCopy = { reload: 'Reload saved draft', outdated: 'The app was updated. Review the saved draft before submitting.', failed: 'Submission failed.', goToClaim: 'Open claim', goToClaims: 'My claims', label: 'Submit claim', success: 'Case submitted. You can track it from the dashboard. Your saved draft stays separate; later edits to the draft do not change this case.', unexpected: 'Unexpected failure.' };
const id = '63ffc31e-8c64-4758-995a-c57f40de7568';
function view(overrides: Partial<React.ComponentProps<typeof DormantPreview>> = {}) {
  return render(
    <DormantPreview
      activeDraftId={id}
      activeDraftVersion={3}
      copy={copy}
      draft={draft}
      hasUnsavedChanges={false}
      headingRef={{ current: null }}
      labels={{ category: 'Vehicle', issue: 'Collision', outcome: 'Repair' }}
      submitCopy={submitCopy}
      tFree={(key: string) => key}
      {...overrides}
    />
  );
}
describe('saved draft canonical submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.lookup.mockResolvedValue({ claim: null });
    h.monitor.mockReturnValue({ finish: h.outcome });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  });
  // prettier-ignore
  it.each([
    ['dirty', { hasUnsavedChanges: true }, copy.submitUnsavedExplanation],
    ['new and unconfirmed', { activeDraftId: null, activeDraftVersion: null, confirmationRequired: true, confirmationRequiredCopy: 'Confirm the incident country.' }, copy.submitFirstSaveExplanation],
    ['missing version', { activeDraftVersion: null }, copy.submitExplanation],
    ['malformed id', { activeDraftId: 'draft-1' }, copy.submitExplanation],
    ['missing issue', { draft: { ...draft, issueType: '' } }, copy.submitIncompleteExplanation],
    ['missing date', { draft: { ...draft, incidentDate: '' } }, copy.submitIncompleteExplanation],
    ['missing counterparty', { draft: { ...draft, counterparty: '' } }, copy.submitIncompleteExplanation],
    ['missing outcome', { draft: { ...draft, desiredOutcome: '' } }, copy.submitIncompleteExplanation],
    ['missing summary', { draft: { ...draft, summary: '' } }, copy.submitIncompleteExplanation],
    ['incomplete dirty and unconfirmed', { draft: { ...draft, summary: '' }, hasUnsavedChanges: true, confirmationRequired: true, confirmationRequiredCopy: 'Confirm the incident country.' }, copy.submitIncompleteExplanation],
    ['manager only', { managerOnly: true }, copy.submitMembershipExplanation],
    ['manager-only dirty', { managerOnly: true, hasUnsavedChanges: true }, copy.submitMembershipExplanation],
    ['manager-only incomplete', { managerOnly: true, draft: { ...draft, summary: '' } }, copy.submitMembershipExplanation],
    ['unconfirmed diaspora country', { confirmationRequired: true, confirmationRequiredCopy: 'Confirm the incident country.' }, 'Confirm the incident country.'],
  ])('keeps submit inert when the draft is %s', (_name, overrides, explanation) => {
    view(overrides as never);
    const disabled = screen.getByTestId('claim-draft-submit-disabled');
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute('aria-describedby', 'claim-draft-submit-explanation');
    expect(disabled).toHaveAccessibleDescription(explanation);
    expect(screen.getByText(copy.truth)).toBeVisible();
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.monitor).not.toHaveBeenCalled();
  });

  it('submits exactly once and replaces the action with canonical success truth', async () => {
    let finish!: (value: unknown) => void;
    h.submit.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    view();
    expect(screen.queryByText(copy.truth)).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: submitCopy.label });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    expect(h.submit).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(h.submit).toHaveBeenCalledWith({ id, expectedVersion: 3 });
    expect(h.monitor).toHaveBeenCalledExactlyOnceWith('saved_draft_submit');
    finish({ success: true, claimId: 'claim-1', claimNumber: 'CLM-KS-2026-000001' });
    expect(await screen.findByTestId('claim-created-success')).toHaveTextContent(
      submitCopy.success
    );
    expect(screen.getByTestId('claim-created-success')).not.toHaveTextContent(
      copy.existingCaseSuccess
    );
    expect(screen.getByTestId('claim-created-success')).toHaveAttribute(
      'data-claim-number',
      'CLM-KS-2026-000001'
    );
    expect(screen.getByTestId('claim-created-success').tagName).toBe('OUTPUT');
    expect(screen.getByTestId('claim-created-success').querySelector('p')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(submitCopy.success);
    expect(h.outcome).toHaveBeenCalledExactlyOnceWith('success');
    expect(screen.getByRole('link', { name: submitCopy.goToClaim })).toHaveAttribute(
      'href',
      '/en/member/claims/claim-1'
    );
    expect(screen.queryByRole('button', { name: submitCopy.label })).not.toBeInTheDocument();
  });
  it('supports native keyboard activation at the bounded mobile viewport', async () => {
    h.submit.mockResolvedValue({
      success: true,
      claimId: 'claim-2',
      claimNumber: 'CLM-KS-2026-000002',
    });
    view();
    const button = screen.getByRole('button', { name: submitCopy.label });
    await waitFor(() => expect(button).toBeEnabled());
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(h.submit).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('claim-created-success')).toBeVisible();
    expect(screen.getByTestId('claim-created-success')).toHaveFocus();
    expect(window.innerWidth).toBe(390);
  });

  it('shows focused truthful failure and permits a bounded retry', async () => {
    h.submit.mockResolvedValueOnce({ success: false }).mockRejectedValueOnce(new Error('boom'));
    view();
    const button = screen.getByRole('button', { name: submitCopy.label });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(submitCopy.failed);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('link', { name: submitCopy.goToClaims })).toHaveAttribute(
      'href',
      '/en/member/claims'
    );
    fireEvent.click(screen.getByRole('button', { name: submitCopy.label }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(submitCopy.unexpected));
    expect(h.submit).toHaveBeenCalledTimes(2);
    expect(h.outcome.mock.calls).toEqual([['rejected'], ['unexpected']]);
  });
  it('offers a native fresh-document continuation after E715 without replaying submission', async () => {
    const error = Object.defineProperty(
      new UnrecognizedActionError('Server Action was not found'),
      '__NEXT_ERROR_CODE',
      { value: 'E715' }
    );
    h.submit.mockRejectedValue(error);
    view();
    const submit = screen.getByRole('button', { name: submitCopy.label });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(submitCopy.outdated);
    await waitFor(() => expect(alert).toHaveFocus());
    const reload = screen.getByRole('link', { name: submitCopy.reload });
    expect(reload.tagName).toBe('A');
    expect(reload).toHaveAttribute('href', `/en/member/claims/new?mode=drafts#draft=${id}`);
    expect(screen.queryByRole('button', { name: submitCopy.label })).not.toBeInTheDocument();
    expect(h.submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('claim-created-success')).not.toBeInTheDocument();
    expect(screen.getByTestId('claim-draft-dormant-preview')).toHaveTextContent(draft.summary);
  });
});
