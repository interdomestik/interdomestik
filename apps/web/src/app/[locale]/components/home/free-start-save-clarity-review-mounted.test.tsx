import '@/test/free-start-save-clarity-harness';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FreeStartIntakeShell } from './free-start-intake-shell';
import {
  en,
  secureSave,
  shellProps,
  boundaries,
  reviewFacts,
  expectNoBoundaryReached,
  setupSaveClarity,
} from '@/test/free-start-save-clarity-harness';

describe('save options review', () => {
  setupSaveClarity();

  it('reveals the real secure save on review without an extra click, save or focus theft', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    await reviewFacts('vehicle');

    expect(screen.queryByTestId('free-start-save-entry')).toBeNull();
    const save = await screen.findByTestId('free-start-save-open');
    expect(save).toHaveAttribute('data-emphasis', 'primary');
    expect(screen.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'idle');
    // Revealing the decision never saves, verifies or navigates on its own.
    expect(screen.queryByTestId('free-start-save-otp')).toBeNull();
    expectNoBoundaryReached();
    // The review heading keeps focus; the revealed save heading does not take it.
    expect(screen.getByRole('heading', { name: en.preview.heading })).toHaveFocus();
    // The optional summary steps back only because a real primary save replaced it here.
    expect(screen.getByTestId('free-start-preview-finish')).toHaveAttribute(
      'data-emphasis',
      'secondary'
    );
    expect(screen.getByTestId('free-start-preview-finish')).toHaveTextContent(en.preview.finish);
    // The full temporary-result and service-limit explanation sits with that optional action,
    // before it generates anything, and the action points at it.
    const truth = screen.getByTestId('free-start-preview-truth');
    expect(truth).toHaveTextContent('nothing saves automatically');
    expect(truth).toHaveTextContent(/temporary/i);
    expect(truth).toHaveTextContent(
      /does not create legal representation, accept a claim, submit anything to an insurer, or give professional advice/i
    );
    expect(screen.getByTestId('free-start-preview-finish')).toHaveAttribute(
      'aria-describedby',
      'free-start-preview-truth'
    );
    expect(screen.getByText(en.preview.includes.summary)).toBeInTheDocument();

    // The same existing handler still runs behind the secondary summary action.
    boundaries.submit.mockResolvedValue({ success: false, error: 'nope' });
    fireEvent.click(screen.getByTestId('free-start-preview-finish'));
    await waitFor(() => expect(boundaries.submit).toHaveBeenCalledOnce());
  });

  it('keeps an engaged save area open when the customer returns to the facts', async () => {
    boundaries.account.mockResolvedValue({ ok: false, code: 'authRequired' });
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    await reviewFacts('vehicle');
    fireEvent.click(await screen.findByTestId('free-start-save-open'));
    await screen.findByTestId('free-start-save-otp');

    fireEvent.click(screen.getByRole('button', { name: en.preview.back }));
    await screen.findByLabelText(en.details.summary);
    // The active verification panel survives the return to editing and cannot be closed away.
    expect(screen.getByTestId('free-start-save-otp')).toBeInTheDocument();
    expect(screen.queryByTestId('free-start-save-entry')).toBeNull();
    expect(screen.queryByTestId('free-start-save-close')).toBeNull();
  });

  it('makes an acknowledged clean draft the primary continuation and demotes saving', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    await reviewFacts('vehicle');
    fireEvent.click(await screen.findByTestId('free-start-save-open'));
    await waitFor(() =>
      expect(screen.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved')
    );

    expect(screen.getByTestId('saved-draft-continue')).toHaveTextContent(
      secureSave.continuation.label
    );
    expect(screen.getByTestId('free-start-save-open')).toHaveAttribute(
      'data-emphasis',
      'secondary'
    );
    expect(screen.getByTestId('free-start-manage-open')).toHaveAttribute(
      'data-emphasis',
      'secondary'
    );
    expect(screen.getByTestId('free-start-preview-finish')).toHaveAttribute(
      'data-emphasis',
      'secondary'
    );
    expect(boundaries.create).toHaveBeenCalledOnce();
    expect(boundaries.update).not.toHaveBeenCalled();
    expect(boundaries.submit).not.toHaveBeenCalled();

    // An unsaved edit is not an acknowledged draft, so continuation is withdrawn.
    fireEvent.click(screen.getByRole('button', { name: en.preview.back }));
    await waitFor(() =>
      expect(screen.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'dirty')
    );
    expect(screen.queryByTestId('saved-draft-continue')).toBeNull();
    expect(screen.getByTestId('free-start-save-open')).toHaveAttribute('data-emphasis', 'primary');
  });

  it('keeps the optional summary primary for injury intake, with no save offered', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="injury" />);
    await reviewFacts('injury');

    expect(screen.getByTestId('free-start-preview-finish')).toHaveAttribute(
      'data-emphasis',
      'primary'
    );
    expect(screen.queryByTestId('free-start-secure-save-band')).toBeNull();
    expect(screen.getByTestId('free-start-save-entry')).toBeInTheDocument();
    expect(screen.queryByTestId('free-start-save-entry-open')).toBeNull();
    expect(screen.getByTestId('free-start-save-entry-manage')).toBeEnabled();
    expectNoBoundaryReached();
  });

  it('leaves a non-neutral host with its existing rendering and primary summary', async () => {
    render(
      <FreeStartIntakeShell
        continueHref="/pricing"
        initialCategory="vehicle"
        locale="en"
        tenantId="tenant_public"
      />
    );
    await reviewFacts('vehicle');

    expect(screen.queryByTestId('free-start-save-entry')).toBeNull();
    expect(screen.queryByTestId('free-start-secure-save-band')).toBeNull();
    expect(screen.queryByTestId('browser-recovery-disclosure')).toBeNull();
    expect(screen.getByTestId('free-start-preview-finish')).toHaveAttribute(
      'data-emphasis',
      'primary'
    );
    expectNoBoundaryReached();
  });

  it('keeps narrative-heading focus on review return after explicitly closing save options', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    fireEvent.click(await screen.findByTestId('free-start-save-entry-open'));
    fireEvent.click(await screen.findByTestId('free-start-save-close'));
    expect(await screen.findByTestId('free-start-save-entry-open')).toHaveFocus();

    await reviewFacts('vehicle');
    fireEvent.click(screen.getByRole('button', { name: en.preview.back }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: en.details.summary })).toHaveFocus()
    );
    expect(screen.getByTestId('free-start-save-entry-open')).not.toHaveFocus();
    expectNoBoundaryReached();
  });

  it('keeps management and reset available without saving an active draft switched to injury', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    await reviewFacts('vehicle');
    fireEvent.click(await screen.findByTestId('free-start-save-open'));
    await waitFor(() =>
      expect(screen.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved')
    );
    fireEvent.click(screen.getByRole('button', { name: en.preview.back }));
    fireEvent.click(await screen.findByRole('button', { name: en.selectedSituation.change }));
    fireEvent.click(await screen.findByTestId('free-start-category-injury'));

    expect(screen.queryByTestId('free-start-save-open')).toBeNull();
    expect(screen.queryByTestId('free-start-save-changes')).toBeNull();
    expect(screen.queryByTestId('saved-draft-continue')).toBeNull();
    expect(screen.getByTestId('free-start-manage-open')).toBeEnabled();
    expect(screen.getByTestId('free-start-start-another')).toBeEnabled();
    expect(boundaries.create).toHaveBeenCalledOnce();
    expect(boundaries.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('free-start-start-another'));
    await waitFor(() => expect(screen.queryByTestId('free-start-start-another')).toBeNull());
    expect(boundaries.update).not.toHaveBeenCalled();
    expect(boundaries.remove).not.toHaveBeenCalled();
  });
});
