import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  advance,
  Harness,
  input,
  navigate,
  navigated,
  pendingKind,
  popTo,
  popToPath,
  settle,
  setupSearchHarness,
  typeDraft,
} from './responsive-search-test-support';
import { PENDING_FEEDBACK_TIMEOUT_MS, SEARCH_COMMIT_DELAY_MS } from './use-responsive-search';

describe('useResponsiveSearch', () => {
  setupSearchHarness();

  it('commits one navigation per typing burst and keeps the input editable', () => {
    render(<Harness />);

    for (const value of ['a', 'ad', 'ada', 'ada l']) {
      typeDraft(value);
    }

    expect(input().value).toBe('ada l');
    expect(input()).not.toBeDisabled();
    expect(pendingKind()).toBe('search');

    advance(SEARCH_COMMIT_DELAY_MS - 1);
    expect(navigate).not.toHaveBeenCalled();

    advance(1);
    expect(navigated()).toEqual(['q=ada+l']);
  });

  it('keeps a draft that only differs from the committed term by whitespace quiet', () => {
    render(<Harness query="q=ada" />);

    typeDraft('ada  ');

    expect(pendingKind()).toBe('none');
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();
    // Pending completion policy: the raw text survives until external adoption.
    expect(input().value).toBe('ada  ');
  });

  it('preserves the newer draft when an older own commit echoes', () => {
    const { rerender } = render(<Harness />);

    typeDraft('ad');
    settle();
    expect(navigated()).toEqual(['q=ad']);

    typeDraft('ada lovelace');
    rerender(<Harness query="q=ad" />);

    expect(input().value).toBe('ada lovelace');
    expect(pendingKind()).toBe('search');

    settle();
    expect(navigated()).toEqual(['q=ad', 'q=ada+lovelace']);
  });

  it('settles repeated A-B-A own destinations on the final echo', () => {
    const { rerender } = render(<Harness />);

    for (const value of ['a', 'b', 'a']) {
      typeDraft(value);
      settle();
    }
    expect(navigated()).toEqual(['q=a', 'q=b', 'q=a']);

    rerender(<Harness query="q=a" />);

    expect(pendingKind()).toBe('none');
    expect(input().value).toBe('a');
    advance(1_000);
    expect(navigated()).toHaveLength(3);
  });

  it('adopts an external url change and cancels queued work', () => {
    const { rerender } = render(<Harness query="q=alpha" />);

    typeDraft('alpha beta');
    rerender(<Harness query="q=gamma&view=active" />);

    expect(input().value).toBe('gamma');
    expect(pendingKind()).toBe('none');
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cancels queued work on back/forward and stays inert until the router catches up', () => {
    const { rerender } = render(<Harness query="q=alpha" />);

    typeDraft('alpha beta');
    popTo('q=previous');

    expect(input().value).toBe('previous');
    expect(pendingKind()).toBe('filter');
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();

    rerender(<Harness query="q=previous" />);
    expect(pendingKind()).toBe('none');
  });

  it('cancels queued work when back returns to the same committed query', () => {
    render(<Harness query="q=alpha" />);

    typeDraft('alpha beta');
    popTo('q=alpha');

    expect(input().value).toBe('alpha');
    expect(pendingKind()).toBe('none');
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('treats the locale prefixed form of this route as the same destination', () => {
    render(<Harness query="q=alpha" />);

    typeDraft('alpha beta');
    // next-intl exposes locale free pathnames; the browser keeps the prefix.
    popToPath('/sq/agent/members', 'q=alpha');

    expect(input().value).toBe('alpha');
    expect(pendingKind()).toBe('none');
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('blocks the stale adapter when back changes route but keeps the query', () => {
    render(<Harness query="q=alpha" />);

    typeDraft('alpha beta');
    popToPath('/sq/agent/clients', 'q=alpha');

    expect(pendingKind()).toBe('filter');
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();

    // The destination owns the url: this adapter is stale until adoption.
    typeDraft('typed on the old page');
    advance(1_000);
    expect(input().value).toBe('typed on the old page');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('drops queued work through the explicit cancellation api', () => {
    const { rerender } = render(<Harness query="q=alpha" />);

    typeDraft('alpha beta');
    fireEvent.click(screen.getByTestId('cancel'));

    expect(pendingKind()).toBe('filter');
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();

    // While an adapter navigation owns the url, text is kept but nothing commits.
    typeDraft('alpha gamma');
    advance(1_000);
    expect(input().value).toBe('alpha gamma');
    expect(navigate).not.toHaveBeenCalled();

    rerender(<Harness query="q=delta" />);
    expect(input().value).toBe('delta');
    expect(pendingKind()).toBe('none');
  });

  it('settles queued work when an explicit navigation keeps this committed url', () => {
    render(<Harness query="q=alpha" />);

    typeDraft('alpha beta');
    fireEvent.click(screen.getByTestId('settle'));

    // No echo will arrive for a same-url navigation: no stale draft and no
    // pending feedback left hanging until the recovery timeout.
    expect(pendingKind()).toBe('none');
    expect(input().value).toBe('alpha');
    advance(PENDING_FEEDBACK_TIMEOUT_MS);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('blocks adapter filter navigation through the synchronous pending accessor', () => {
    render(<Harness />);

    typeDraft('ada');
    fireEvent.click(screen.getByTestId('guarded-filter'));
    expect(navigate).not.toHaveBeenCalled();

    settle();
    expect(navigated()).toEqual(['q=ada']);
  });

  it('lets a direct filter navigation cancel the queued draft commit', () => {
    render(<Harness />);

    typeDraft('ada');
    advance(100);
    fireEvent.click(screen.getByTestId('direct-filter'));

    expect(navigated()).toEqual(['view=active']);
    expect(pendingKind()).toBe('filter');
    advance(1_000);
    expect(navigated()).toEqual(['view=active']);
  });

  it('reports a same-url navigation request without pending feedback', () => {
    render(<Harness query="view=active" />);

    fireEvent.click(screen.getByTestId('noop-request'));

    expect(screen.getByTestId('last-request')).toHaveTextContent('false');
    expect(pendingKind()).toBe('none');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves Enter to the adapter without extra or lost commits', () => {
    render(<Harness />);

    typeDraft('ada');
    fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter' });
    advance(1_000);

    expect(navigated()).toEqual(['q=ada']);
  });

  it('recovers pending feedback after the timeout without firing abandoned work', () => {
    render(<Harness />);

    typeDraft('ada');
    settle();
    expect(navigated()).toEqual(['q=ada']);
    expect(pendingKind()).toBe('search');

    advance(PENDING_FEEDBACK_TIMEOUT_MS);

    expect(pendingKind()).toBe('none');
    expect(navigated()).toEqual(['q=ada']);
    expect(input().value).toBe('ada');
  });

  it('cancels scheduled work on unmount and commits once under StrictMode', () => {
    const { unmount } = render(<Harness />);

    typeDraft('ada');
    unmount();
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();

    render(
      <StrictMode>
        <Harness initialDraft="seed" />
      </StrictMode>
    );

    // No committed term for this key: the server resolved seed still applies.
    expect(input().value).toBe('seed');
    typeDraft('ada');
    settle();
    expect(navigated()).toEqual(['q=ada']);
  });

  it('never lets the initial draft override the committed url, on mount either', () => {
    const { rerender } = render(<Harness query="q=seed" initialDraft="seed draft" />);

    // A stale server seed loses to the committed term from the first render.
    expect(input().value).toBe('seed');
    advance(1_000);
    expect(navigate).not.toHaveBeenCalled();

    rerender(<Harness query="q=other" initialDraft="seed draft" />);
    expect(input().value).toBe('other');
  });

  it('preserves the initial server seed through StrictMode without a committed term', () => {
    render(
      <StrictMode>
        <Harness initialDraft="server seed" />
      </StrictMode>
    );
    expect(input()).toHaveValue('server seed');
    expect(pendingKind()).toBe('none');
    settle();
    expect(navigate).not.toHaveBeenCalled();
  });
});
