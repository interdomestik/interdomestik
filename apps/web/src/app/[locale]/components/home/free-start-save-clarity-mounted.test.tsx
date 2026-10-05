import '@/test/free-start-save-clarity-harness';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FreeStartIntakeShell } from './free-start-intake-shell';
import {
  en,
  boundaries,
  secureSave,
  shellProps,
  expectNoBoundaryReached,
  setupSaveClarity,
} from '@/test/free-start-save-clarity-harness';

describe('save options entry', () => {
  setupSaveClarity();

  it('keeps one primary action and no stacked save explanations while facts are entered', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    const entry = await screen.findByTestId('free-start-save-entry');

    expect(entry).toHaveTextContent(en.saveEntry.heading);
    expect(screen.getByTestId('free-start-save-entry-status')).toHaveTextContent(
      en.saveEntry.status.neutral
    );
    expect(screen.queryByTestId('free-start-secure-save-band')).toBeNull();
    expect(screen.queryByTestId('free-start-save-open')).toBeNull();
    expect(screen.queryByTestId('free-start-manage-open')).toBeNull();
    expect(screen.queryByTestId('browser-recovery-disclosure')).toBeNull();
    // The review step keeps the single primary action.
    expect(screen.getByRole('button', { name: en.details.continue })).toBeInTheDocument();
    // The permanent service limit stays visible, but the long temporary-result and storage
    // explanation is not repeated while facts are entered.
    const boundary = screen.getByTestId('free-start-trust-boundary');
    expect(boundary).toHaveTextContent(en.trustBoundary.short);
    expect(boundary).not.toHaveTextContent('nothing saves automatically');
    expect(boundary).not.toHaveTextContent('30 days');
    expect(screen.queryByTestId('free-start-preview-truth')).toBeNull();
    // Both optional openers declare the area they reveal, and neither is autofocused.
    for (const id of ['free-start-save-entry-open', 'free-start-save-entry-manage']) {
      const opener = screen.getByTestId(id);
      expect(opener).toHaveAttribute('aria-expanded', 'false');
      expect(opener).toHaveAttribute('aria-controls', 'free-start-save-area');
      expect(opener).not.toHaveFocus();
    }
    expect(document.getElementById('free-start-save-area')).not.toBeNull();
    expectNoBoundaryReached();
  });

  it('opens the save options as presentation only, with every decision fact before any enable', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    fireEvent.click(await screen.findByTestId('free-start-save-entry-open'));

    const band = await screen.findByTestId('free-start-secure-save-band');
    expect(screen.queryByTestId('free-start-save-entry')).toBeNull();
    // No consent, no lifecycle intent, no storage, no OTP and no navigation followed the opener.
    expect(screen.getByTestId('premium-free-start-organizer')).toHaveAttribute(
      'data-save-behavior',
      'explicit-only'
    );
    expect(screen.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'idle');
    expect(screen.queryByTestId('free-start-save-otp')).toBeNull();
    expectNoBoundaryReached();

    // The secure-save facts are complete before the action that performs it.
    expect(band).toHaveTextContent(secureSave.body);
    expect(band).toHaveTextContent(secureSave.privacy);
    expect(screen.getByTestId('free-start-save-open')).toHaveAttribute('data-emphasis', 'primary');

    // Device storage is a second, separate optional decision: collapsed, with no action yet.
    const disclosure = screen.getByTestId('browser-recovery-disclosure');
    const details = screen.getByTestId('browser-recovery-details-open');
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(details).toHaveAttribute('aria-controls', 'browser-recovery-details');
    expect(screen.queryByTestId('browser-recovery-enable')).toBeNull();

    // Expanding it reveals the complete facts and still writes nothing and consents to nothing.
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    for (const fact of [
      'vehicle or property facts',
      'Injury-category notes and documents are excluded',
      'do not enter medical or injury information',
      'shared or public device',
      'continue without device save',
      'expires after 30 days',
      'discard it at any time',
      'only after the verified-email save succeeds',
    ])
      expect(disclosure.textContent?.toLowerCase()).toContain(fact.toLowerCase());
    expectNoBoundaryReached();
    expect(screen.getByTestId('premium-free-start-organizer')).toHaveAttribute(
      'data-save-behavior',
      'explicit-only'
    );
    // Its explicit enable stays necessary, and stays visually quieter than the secure save above.
    expect(screen.getByTestId('browser-recovery-enable')).toHaveAttribute(
      'data-emphasis',
      'secondary'
    );
    expect(screen.getByTestId('free-start-save-open')).toHaveAttribute('data-emphasis', 'primary');
  });

  it.each(['free-start-save-entry-open', 'free-start-save-entry-manage'] as const)(
    'focuses the save heading from %s and returns focus to that same control',
    async opener => {
      render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
      fireEvent.click(await screen.findByTestId(opener));

      const heading = await screen.findByRole('heading', { name: secureSave.heading });
      await waitFor(() => expect(heading).toHaveFocus());
      expect(heading).toHaveAttribute('tabindex', '-1');

      fireEvent.click(screen.getByTestId('free-start-save-close'));
      expect(await screen.findByTestId(opener)).toHaveFocus();
      expect(screen.queryByTestId('free-start-secure-save-band')).toBeNull();
      expectNoBoundaryReached();
    }
  );

  it.each([undefined, 'injury'] as const)(
    'offers management without an unsupported save action for category %s',
    async initialCategory => {
      render(<FreeStartIntakeShell {...shellProps} initialCategory={initialCategory} />);
      const manage = await screen.findByTestId('free-start-save-entry-manage');
      expect(manage).toBeEnabled();
      expect(screen.queryByTestId('free-start-save-entry-open')).toBeNull();
      expectNoBoundaryReached();

      fireEvent.click(manage);
      await screen.findByTestId('free-start-secure-save-band');
      expect(screen.queryByTestId('free-start-save-open')).toBeNull();
      expect(screen.getByTestId('free-start-manage-open')).toBeEnabled();
      expectNoBoundaryReached();

      fireEvent.click(screen.getByTestId('free-start-save-close'));
      expect(await screen.findByTestId('free-start-save-entry-manage')).toHaveFocus();
      fireEvent.click(screen.getByTestId('free-start-save-entry-manage'));
      fireEvent.click(await screen.findByTestId('free-start-manage-open'));
      await waitFor(() => expect(boundaries.list).toHaveBeenCalledOnce());
      const manageCopy = JSON.parse(en.secureSave) as { manage: { heading: string } };
      expect(
        await screen.findByRole('heading', { name: manageCopy.manage.heading, level: 4 })
      ).toBeVisible();
      expect(boundaries.create).not.toHaveBeenCalled();
      expect(boundaries.update).not.toHaveBeenCalled();
      expect(screen.queryByTestId('free-start-save-open')).toBeNull();
    }
  );

  it('returns focus to management when the previous save opener becomes unsupported', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    fireEvent.click(await screen.findByTestId('free-start-save-entry-open'));
    await screen.findByTestId('free-start-secure-save-band');
    fireEvent.click(screen.getByRole('button', { name: en.selectedSituation.change }));
    fireEvent.click(await screen.findByTestId('free-start-category-injury'));
    expect(screen.queryByTestId('free-start-save-open')).toBeNull();
    fireEvent.click(screen.getByTestId('free-start-save-close'));
    expect(await screen.findByTestId('free-start-save-entry-manage')).toHaveFocus();
    expect(screen.queryByTestId('free-start-save-entry-open')).toBeNull();
    expectNoBoundaryReached();
  });

  it.each([
    { category: 'injury' as const, neutralOtpHost: shellProps.neutralOtpHost },
    { category: 'vehicle' as const, neutralOtpHost: undefined },
  ])(
    'keeps the full resolved disclosure while editing $category on host $neutralOtpHost',
    async ({ category, neutralOtpHost }) => {
      render(
        <FreeStartIntakeShell
          {...shellProps}
          initialCategory={category}
          neutralOtpHost={neutralOtpHost}
        />
      );
      await waitFor(() =>
        expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
      );
      const noRecovery = (JSON.parse(en.secureSaveReviewCopy) as { noRecovery: string }).noRecovery;
      const boundary = screen.getByTestId('free-start-trust-boundary');
      expect(screen.getByLabelText(en.details.summary)).toBeVisible();
      expect(boundary).toHaveTextContent(noRecovery);
      expect(boundary).toHaveTextContent('nothing saves automatically');
      expect(boundary).toHaveTextContent('generated result itself remains temporary');
      expect(boundary).not.toHaveTextContent('recover automatically only on this browser');
      expect(screen.queryByTestId('free-start-preview-truth')).toBeNull();
      expectNoBoundaryReached();
    }
  );
});
