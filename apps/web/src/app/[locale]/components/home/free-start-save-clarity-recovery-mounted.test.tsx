import '@/test/free-start-save-clarity-harness';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FreeStartIntakeShell } from './free-start-intake-shell';
import { SecureSaveEntry } from './free-start-intake-shell/secure-save-entry';
import {
  en,
  shellProps,
  boundaries,
  active,
  copy,
  recoveryCopy,
  expectNoBoundaryReached,
  setupSaveClarity,
} from '@/test/free-start-save-clarity-harness';

describe('save options locales and recovery', () => {
  setupSaveClarity();

  it.each(['en', 'mk', 'sq', 'sr'] as const)(
    'offers the same optional save entry and decision facts in %s',
    async locale => {
      active.locale = locale;
      const text = copy();
      render(<FreeStartIntakeShell {...shellProps} initialCategory="property" locale={locale} />);

      const entry = await screen.findByTestId('free-start-save-entry');
      expect(entry).toHaveTextContent(text.saveEntry.heading);
      expect(entry).toHaveTextContent(text.saveEntry.status.neutral);
      expect(screen.getByTestId('free-start-trust-boundary')).toHaveTextContent(
        text.trustBoundary.short
      );
      fireEvent.click(screen.getByRole('button', { name: text.saveEntry.open }));

      const band = await screen.findByTestId('free-start-secure-save-band');
      const localeSecureSave = JSON.parse(text.secureSave) as { heading: string; privacy: string };
      expect(band).toHaveAccessibleName(localeSecureSave.heading);
      expect(band).toHaveTextContent(localeSecureSave.privacy);
      // The device details stay collapsed in every locale until the customer opens them.
      const disclosure = await screen.findByTestId('browser-recovery-disclosure');
      expect(disclosure).toHaveAccessibleName(text.localRecoveryDisclosure.heading);
      expect(screen.queryByRole('button', { name: text.localRecoveryDisclosure.skip })).toBeNull();
      fireEvent.click(screen.getByTestId('browser-recovery-details-open'));
      expect(disclosure).toHaveTextContent(text.localRecoveryDisclosure.risk);
      expect(disclosure).toHaveTextContent('30');
      expect(screen.getByRole('button', { name: text.localRecoveryDisclosure.skip })).toBeEnabled();
      expect(
        screen.getByRole('button', { name: text.localRecoveryDisclosure.enable })
      ).toBeEnabled();
      expect(screen.getByRole('button', { name: text.saveEntry.close })).toBeEnabled();
      expectNoBoundaryReached();
    }
  );

  it('never claims absence when browser storage cannot be read at all', async () => {
    // Unavailable storage means absence is unknown, so the collapsed status may not assert it.
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);

    const status = await screen.findByTestId('free-start-save-entry-status');
    expect(status).toHaveTextContent(en.saveEntry.status.neutral);
    expect(status).not.toHaveTextContent(/nothing/i);
    expect(status).not.toHaveTextContent(en.saveEntry.status.device);
    // The recovery band keeps owning that outcome, outside the optional save area.
    const recoveryStatus = await screen.findByTestId('anonymous-draft-recovery-status');
    expect(recoveryStatus).toHaveTextContent(recoveryCopy.status.unavailable);
    expect(screen.getByTestId('premium-free-start-organizer')).toHaveAttribute(
      'data-save-behavior',
      'explicit-only'
    );
    for (const boundary of Object.values(boundaries)) expect(boundary).not.toHaveBeenCalled();
  });

  it('reports a kept device copy only once recovery proves one exists', () => {
    const onOpen = vi.fn();
    const onFocusRestored = vi.fn();
    const { rerender } = render(
      <SecureSaveEntry
        copy={en.saveEntry}
        saveAvailable
        deviceCopyKept={false}
        restoreFocus="none"
        onOpen={onOpen}
        onFocusRestored={onFocusRestored}
      />
    );

    // Idle, discarded and unavailable recovery all share the conservative line: a superseded
    // record can still sit on the device while a replacement write runs, so absence is not claimed.
    expect(screen.getByTestId('free-start-save-entry-status')).toHaveTextContent(
      en.saveEntry.status.neutral
    );
    rerender(
      <SecureSaveEntry
        copy={en.saveEntry}
        saveAvailable
        deviceCopyKept
        restoreFocus="none"
        onOpen={onOpen}
        onFocusRestored={onFocusRestored}
      />
    );
    expect(screen.getByTestId('free-start-save-entry-status')).toHaveTextContent(
      en.saveEntry.status.device
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(onFocusRestored).not.toHaveBeenCalled();
  });
});
