import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en/admin-branches.json';
import { HealthExplanationTooltip } from './health-explanation-tooltip';

vi.unmock('next-intl');

const copy = messages.admin.branches.health.tooltip;

function setup(disabled = false, severity: keyof typeof copy = 'urgent', catalog = messages) {
  render(
    <NextIntlClientProvider locale="en" messages={catalog}>
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
  it('opens on click and closes on a second click', async () => {
    const user = setup();
    const trigger = screen.getByRole('button', { name: copy.urgent.title });
    await user.click(trigger);
    const explanation = await screen.findByRole('dialog', { name: copy.urgent.title });
    for (const bullet of copy.urgent.bullets) {
      expect(within(explanation).getByText(bullet)).toBeInTheDocument();
    }
    expect(within(explanation).getByText(copy.urgent.action)).toBeInTheDocument();
    expect(screen.getByTestId('panel')).not.toContainElement(explanation);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(explanation).toHaveFocus();
    await user.click(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
    ['Escape', '{Escape}'],
  ])('opens by Enter and closes by %s with focus return', async (dismissal, key) => {
    const user = setup();
    const trigger = screen.getByRole('button', { name: copy.urgent.title });
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    const explanation = await screen.findByRole('dialog', { name: copy.urgent.title });
    expect(explanation).toHaveFocus();
    if (dismissal !== 'Escape') {
      // Activation toggles the trigger; Escape dismisses directly from the content.
      act(() => trigger.focus());
      expect(explanation).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    }
    await user.keyboard(key);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens by Space and returns focus after Escape', async () => {
    const user = setup();
    const trigger = screen.getByRole('button', { name: copy.urgent.title });
    await user.tab();
    await user.keyboard(' ');
    expect(await screen.findByRole('dialog', { name: copy.urgent.title })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('toggles on repeated touch taps without hover', async () => {
    const user = setup();
    const trigger = screen.getByRole('button', { name: copy.urgent.title });
    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(await screen.findByRole('dialog', { name: copy.urgent.title })).toHaveFocus();
    await user.pointer({ keys: '[TouchA]', target: trigger });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('dismisses on an outside click and leaves focus at the clicked control', async () => {
    const user = setup();
    const trigger = screen.getByRole('button', { name: copy.urgent.title });
    await user.click(trigger);
    expect(await screen.findByRole('dialog', { name: copy.urgent.title })).toBeInTheDocument();
    const outside = screen.getByRole('button', { name: 'Outside' });
    await user.click(outside);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(outside).toHaveFocus();
  });

  it('keeps long content in the focused, height-constrained scroll container', async () => {
    const catalog = structuredClone(messages);
    const longBullets = copy.urgent.bullets.map(bullet => Array(30).fill(bullet).join(' '));
    catalog.admin.branches.health.tooltip.urgent.bullets = longBullets;
    const user = setup(false, 'urgent', catalog);
    await user.tab();
    await user.keyboard('{Enter}');
    const explanation = await screen.findByRole('dialog', { name: copy.urgent.title });
    // jsdom has no layout: assert the real Radix focus and CSS scrolling contract.
    expect(explanation).toHaveFocus();
    expect(explanation).toHaveAttribute('tabindex', '-1');
    expect(explanation).toHaveClass(
      'overflow-y-auto',
      'max-h-[var(--radix-popover-content-available-height)]'
    );
    for (const bullet of longBullets) {
      expect(within(explanation).getByText(bullet)).toBeInTheDocument();
    }
    expect(within(explanation).getByText(copy.urgent.action)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('preserves the single-bullet inactive explanation', async () => {
    const user = setup(false, 'inactive');
    await user.click(screen.getByRole('button', { name: copy.inactive.title }));
    const explanation = await screen.findByRole('dialog', { name: copy.inactive.title });
    expect(within(explanation).getAllByRole('listitem')).toHaveLength(1);
  });

  it('leaves disabled zero-workload content without an explanation control', () => {
    setup(true);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.urgent.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
