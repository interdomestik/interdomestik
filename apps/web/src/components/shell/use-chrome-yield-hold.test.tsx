import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHROME_YIELD_HOLD_ATTRIBUTE, useChromeYieldHold } from './use-chrome-yield-hold';

function Workspace() {
  const root = useRef<HTMLDivElement>(null);
  useChromeYieldHold(root);
  return (
    <div ref={root} data-testid="workspace">
      <textarea aria-label="Note" />
      <button type="button">Refresh</button>
    </div>
  );
}

const dispatch = (target: EventTarget, type: string) =>
  act(() => {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  });

describe('useChromeYieldHold', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds the yielded chrome from pointer down until the click completes', () => {
    render(<Workspace />);
    const workspace = screen.getByTestId('workspace');
    const button = screen.getByRole('button', { name: 'Refresh' });
    screen.getByRole('textbox', { name: 'Note' }).focus();

    dispatch(button, 'pointerdown');
    // WebKit leaves the pressed button unfocused; the hold must not depend on button focus.
    act(() => (document.activeElement as HTMLElement).blur());
    expect(workspace.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)).toBe(true);

    dispatch(button, 'pointerup');
    expect(workspace.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)).toBe(true);
    dispatch(button, 'click');
    act(() => vi.advanceTimersByTime(0));
    expect(workspace.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)).toBe(false);
  });

  it('releases a cancelled gesture without a click', () => {
    render(<Workspace />);
    const workspace = screen.getByTestId('workspace');
    screen.getByRole('textbox', { name: 'Note' }).focus();

    dispatch(workspace, 'pointerdown');
    dispatch(workspace, 'pointercancel');
    expect(workspace.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)).toBe(true);
    act(() => vi.advanceTimersByTime(400));
    expect(workspace.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)).toBe(false);
  });

  it('does not hold when no editable field has focus', () => {
    render(<Workspace />);
    const workspace = screen.getByTestId('workspace');
    screen.getByRole('button', { name: 'Refresh' }).focus();

    dispatch(workspace, 'pointerdown');
    expect(workspace.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)).toBe(false);
  });

  it('removes the hold when the workspace unmounts mid-gesture', () => {
    const { unmount } = render(<Workspace />);
    const workspace = screen.getByTestId('workspace');
    screen.getByRole('textbox', { name: 'Note' }).focus();
    dispatch(workspace, 'pointerdown');

    unmount();
    expect(workspace.hasAttribute(CHROME_YIELD_HOLD_ATTRIBUTE)).toBe(false);
  });
});
