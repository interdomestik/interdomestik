import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DormantPreview } from './dormant-preview';

const h = vi.hoisted(() => ({ lookup: vi.fn(), submit: vi.fn() }));
vi.mock('@/actions/claims/create-from-saved-draft', () => ({
  createClaimFromSavedDraft: h.submit,
  lookupSavedDraftClaim: h.lookup,
}));
vi.mock('next-intl', () => ({ useLocale: () => 'en' }));

const idA = '63ffc31e-8c64-4758-995a-c57f40de7568';
const idB = 'a1ff9e4e-63f9-4fd3-9d79-965f7e5e401a';
const claimA = { id: 'claim-a', number: 'CLM-KS-2026-000001' };
const claimB = { id: 'claim-b', number: 'CLM-KS-2026-000002' };
const copy = {
  backToDetails: 'Back',
  categoryBody: 'Body',
  categoryContinue: 'Continue',
  categoryHeading: 'Category',
  heading: 'Draft',
  previewBody: 'Review',
  previewHeading: 'Review facts',
  submitDisabled: 'Not available',
  submitExplanation: 'Save a complete draft first.',
  supporting: 'Support',
  truth: 'Draft truth',
  unsupported: 'Unsupported',
};
const submitCopy = {
  failed: 'Submission failed.',
  goToClaim: 'Open claim',
  goToClaims: 'My claims',
  label: 'Submit claim',
  success: 'Case submitted.',
  unexpected: 'Unexpected failure.',
};
const baseProps = {
  activeDraftId: idA,
  activeDraftVersion: 3,
  copy,
  draft: {
    counterparty: 'Example Insurer',
    desiredOutcome: 'repair' as const,
    incidentDate: '2026-07-20',
    issueType: 'collision' as const,
    summary: 'Damage summary.',
  },
  hasUnsavedChanges: false,
  headingRef: { current: null },
  labels: { category: 'Vehicle', issue: 'Collision', outcome: 'Repair' },
  submitCopy,
  tFree: (key: string) => key,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

describe('saved draft existing claim re-entry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps eligible submit busy while checking, then restores the existing claim link', async () => {
    const lookup = deferred<{ claim: typeof claimA | null }>();
    h.lookup.mockReturnValue(lookup.promise);
    render(<DormantPreview {...baseProps} />);
    const checking = screen.getByRole('button', { name: submitCopy.label });
    expect(checking).toBeDisabled();
    expect(checking).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('claim-created-success')).not.toBeInTheDocument();
    await act(() => {
      lookup.resolve({ claim: claimA });
      return lookup.promise;
    });
    expect(await screen.findByRole('link', { name: submitCopy.goToClaim })).toHaveAttribute(
      'href',
      '/en/member/claims/claim-a'
    );
    expect(screen.queryByRole('button', { name: submitCopy.label })).not.toBeInTheDocument();
    expect(screen.getByTestId('claim-created-success')).not.toHaveFocus();
  });

  it.each([
    ['not found', () => Promise.resolve({ claim: null })],
    ['error', () => Promise.reject(new Error('down'))],
  ])('falls back to the deliberate submit path when lookup is %s', async (_name, result) => {
    h.lookup.mockReturnValue(result());
    render(<DormantPreview {...baseProps} />);
    expect(await screen.findByRole('button', { name: submitCopy.label })).toBeEnabled();
    expect(screen.queryByTestId('claim-created-success')).not.toBeInTheDocument();
  });

  it('lets a found claim override manager-only draft truth without enabling submit', async () => {
    const lookup = deferred<{ claim: typeof claimA | null }>();
    h.lookup.mockReturnValue(lookup.promise);
    render(<DormantPreview {...baseProps} managerOnly />);
    expect(screen.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
    expect(screen.getByText(copy.submitExplanation)).toBeVisible();
    await act(() => {
      lookup.resolve({ claim: claimA });
      return lookup.promise;
    });
    expect(await screen.findByTestId('claim-created-success')).toBeVisible();
    expect(screen.queryByText(copy.truth)).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-draft-submit-disabled')).not.toBeInTheDocument();
  });

  it('resets identity and ignores a late result from the prior draft', async () => {
    const first = deferred<{ claim: typeof claimA | null }>();
    const second = deferred<{ claim: typeof claimB | null }>();
    h.lookup.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<DormantPreview {...baseProps} />);
    rerender(<DormantPreview {...baseProps} activeDraftId={idB} activeDraftVersion={4} />);
    await act(() => {
      second.resolve({ claim: claimB });
      return second.promise;
    });
    await waitFor(() =>
      expect(screen.getByRole('link')).toHaveAttribute('href', '/en/member/claims/claim-b')
    );
    await act(() => {
      first.resolve({ claim: claimA });
      return first.promise;
    });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/en/member/claims/claim-b');
    expect(h.lookup).toHaveBeenCalledTimes(2);
  });
});
