import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import messages from '@/messages/en/admin-branches.json';
import { HealthExplanationTooltip } from './health-explanation-tooltip';

const copy = messages.admin.branches.health.tooltip;

function setup(disabled = false, severity: keyof typeof copy = 'urgent') {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <div style={{ overflow: 'hidden' }} data-testid="panel">
        <HealthExplanationTooltip severity={severity} subject="staff" disabled={disabled}>
          <span>12</span>
        </HealthExplanationTooltip>
      </div>
      <button type="button">Outside</button>
    </NextIntlClientProvider>
  );
  return userEvent.setup();
}

describe('HealthExplanationTooltip', () => {
  it('exposes the full explanation on keyboard focus and dismisses with Escape', async () => {
    const user = setup();
    const trigger = screen.getByRole('button', { name: copy.urgent.title });
    await user.tab();
    expect(trigger).toHaveFocus();
    const explanation = await screen.findByRole('tooltip');
    for (const bullet of copy.urgent.bullets) {
      expect(within(explanation).getByText(bullet)).toBeInTheDocument();
    }
    expect(within(explanation).getByText(copy.urgent.action)).toBeInTheDocument();
    expect(screen.getByTestId('panel')).not.toContainElement(explanation);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    await user.tab();
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('opens on a touch tap without hover and dismisses on an outside tap', async () => {
    const user = setup();
    const trigger = screen.getByRole('button', { name: copy.urgent.title });
    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.pointer({
      keys: '[TouchA]',
      target: screen.getByRole('button', { name: 'Outside' }),
    });
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('retains hover access', async () => {
    const user = setup(false, 'inactive');
    await user.hover(screen.getByRole('button', { name: copy.inactive.title }));
    const explanation = await screen.findByRole('tooltip');
    expect(within(explanation).getAllByRole('listitem')).toHaveLength(1);
  });

  it('leaves disabled zero-workload content without an explanation control', () => {
    setup(true);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.urgent.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
