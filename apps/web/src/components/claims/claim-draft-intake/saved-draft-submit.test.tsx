import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DormantPreview } from './dormant-preview';
const h = vi.hoisted(() => ({ lookup: vi.fn(), submit: vi.fn() }));
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
const copy = { backToDetails: 'Back', categoryBody: 'Body', categoryContinue: 'Continue', categoryHeading: 'Category', existingCaseSuccess: 'There is already a submitted case for this saved draft.', heading: 'Draft', previewBody: 'Review', previewHeading: 'Review facts', submitDisabled: 'Not available', submitExplanation: 'Save a complete draft first.', submitUnsavedExplanation: 'Save your changes before submitting. Saving changes does not submit the claim.', supporting: 'Support', truth: 'Draft truth', unsupported: 'Unsupported' };
const submitCopy = {
  failed: 'Submission failed.',
  goToClaim: 'Open claim',
  goToClaims: 'My claims',
  label: 'Submit claim',
  // prettier-ignore
  success: 'Case submitted. You can track it from the dashboard. Your saved draft stays separate; later edits to the draft do not change this case.',
  unexpected: 'Unexpected failure.',
};
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
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  });
  it.each([
    ['dirty', { hasUnsavedChanges: true }, copy.submitUnsavedExplanation],
    ['not persisted', { activeDraftId: null, activeDraftVersion: null }, copy.submitExplanation],
    ['missing version', { activeDraftVersion: null }, copy.submitExplanation],
    ['malformed id', { activeDraftId: 'draft-1' }, copy.submitExplanation],
    ['incomplete', { draft: { ...draft, summary: '' } }, copy.submitExplanation],
    ['manager only', { managerOnly: true }, copy.submitExplanation],
  ])('keeps submit inert when the draft is %s', (_name, overrides, explanation) => {
    view(overrides as never);
    expect(screen.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
    expect(screen.getByTestId('claim-draft-submit-disabled')).toHaveAccessibleDescription(
      explanation
    );
    expect(screen.getByText(copy.truth)).toBeVisible();
    expect(h.submit).not.toHaveBeenCalled();
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
  });
});
