import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enFreeStartMessages } from '@/messages/free-start-test-messages';
import {
  CATEGORY_EVIDENCE_EXPECTATIONS,
  completeFreeStartIntake,
  getFreeStartMessage,
  moveToFreeStartPreview,
} from '@/test/free-start-organizer-harness';

import { getFreeStartShellBoundary, renderFreeStart } from '@/test/free-start-shell-fixture';

const hoisted = getFreeStartShellBoundary();

describe('FreeStartIntakeShell intake path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.generatePack.mockResolvedValue({
      success: false,
      error: 'Pack generation disabled for legacy shell assertions',
      code: 'GENERATION_FAILED',
    });
  });

  it('shows the three launch categories before the guided intake starts', () => {
    renderFreeStart('en');

    expect(screen.getByTestId('free-start-category-vehicle')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-property')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-injury')).toBeInTheDocument();
  });

  it('focuses the validation alert when the intake cannot continue', async () => {
    const user = userEvent.setup();

    renderFreeStart('en');

    await user.click(
      screen.getByRole('button', { name: getFreeStartMessage('en', 'choose.continue') })
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(enFreeStartMessages.freeStart.validation.chooseCategory);
    expect(alert).toHaveFocus();
  });

  it('keeps the finish button inert while the intake submit is pending', async () => {
    const user = userEvent.setup();
    let resolveSubmit!: (value: {
      success: true;
      data: {
        claimCategory: 'property';
        desiredOutcome: 'repair';
        intakeIssue: 'water_damage';
      };
    }) => void;
    hoisted.submitIntake.mockReturnValue(
      new Promise(resolve => {
        resolveSubmit = resolve;
      })
    );

    renderFreeStart('en');

    await moveToFreeStartPreview(user, 'en');

    const finishButton = screen.getByRole('button', {
      name: getFreeStartMessage('en', 'preview.finish'),
    });
    await user.click(finishButton);

    expect(finishButton).toBeDisabled();
    expect(finishButton).toHaveAttribute('aria-busy', 'true');

    await user.click(finishButton);

    expect(hoisted.submitIntake).toHaveBeenCalledTimes(1);

    resolveSubmit({
      success: true,
      data: {
        claimCategory: 'property',
        desiredOutcome: 'repair',
        intakeIssue: 'water_damage',
      },
    });

    expect(await screen.findByTestId('free-start-complete-pending-pack')).toBeInTheDocument();
  });

  it.each(CATEGORY_EVIDENCE_EXPECTATIONS)(
    'shows category-specific evidence guidance for $category claims in the wizard',
    async ({ category, evidencePrompt }) => {
      const user = userEvent.setup();

      renderFreeStart('en');

      await user.click(screen.getByTestId(`free-start-category-${category}`));

      expect(screen.getByTestId('free-start-evidence-guidance')).toHaveTextContent(evidencePrompt);
    }
  );

  it('shows the retry error when the free start server action throws unexpectedly', async () => {
    const user = userEvent.setup();
    hoisted.submitIntake.mockRejectedValue(new Error('network down'));

    renderFreeStart('en');

    await completeFreeStartIntake(user, 'en');

    expect(await screen.findByTestId('free-start-validation-error')).toHaveTextContent(
      'Please try again. If the problem persists, contact support.'
    );
    expect(screen.queryByTestId('free-start-complete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('free-start-complete-pending-pack')).not.toBeInTheDocument();
  });
});
