import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpNowExperience } from './help-now-experience';
import { getHelpNowCopy } from './copy';
import { HELP_NOW_CONTENT_LOCALES } from './content-packs';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

describe('scenario guidance', () => {
  it.each(HELP_NOW_CONTENT_LOCALES)('changes and resets the checklist in %s', async locale => {
    const user = userEvent.setup();
    const copy = getHelpNowCopy(locale);
    render(<HelpNowExperience locale={locale} />);
    const checklist = () => screen.getByTestId('help-now-checklist-0');
    const original = checklist().textContent;
    await user.click(checklist());
    async function selectScenario(index: number) {
      await user.click(screen.getByRole('button', { name: copy.scenarios[index] }));
      expect(checklist()).toHaveAttribute('aria-pressed', 'false');
      expect(checklist().textContent === original).toBe(index === 0);
      if (index === 1) expect(screen.getByText(copy.injuryPrompt)).toBeVisible();
      if (index === 2) expect(screen.getByText(copy.propertyPrompt)).toBeVisible();
      copy.scenarios.slice(0, 3).forEach((name, cardIndex) => {
        expect(screen.getByRole('button', { name })).toHaveAttribute(
          'aria-pressed',
          String(index === cardIndex)
        );
      });
    }
    await selectScenario(1);
    await selectScenario(2);
    await selectScenario(0);
    const list = screen.getByRole('list', { name: copy.continueSafe });
    const previous = list.textContent;
    await user.click(checklist());
    await user.selectOptions(screen.getByLabelText(copy.countryLabel), 'DE');
    expect(list.textContent).not.toBe(previous);
    expect(within(list).getByText(new RegExp(copy.countries.DE))).toBeVisible();
    expect(checklist()).toHaveAttribute('aria-pressed', 'false');
  });
});
