import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loginFormMocks as mocks,
  resetLoginFormHarness,
  fillAndSubmitCredentials,
  setLoginFormLocation,
} from '@/test/login-form-harness';
import { LoginForm } from './login-form';

let navigation: EventTarget;
let signal: AbortController;
function navigate(url = 'http://localhost/en/member', sameDocument = false) {
  const controller = new AbortController();
  const event = new Event('navigate');
  Object.defineProperties(event, {
    destination: { value: { url, sameDocument } },
    signal: { value: controller.signal },
  });
  navigation.dispatchEvent(event);
  return controller;
}
async function handoff() {
  render(<LoginForm />);
  fillAndSubmitCredentials();
  await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
}

describe('LoginForm canceled document handoff', () => {
  beforeEach(() => {
    resetLoginFormHarness();
    setLoginFormLocation({
      href: 'http://localhost/en/login',
      hash: '',
      assign: mocks.locationAssign,
    });
    navigation = new EventTarget();
    vi.stubGlobal('navigation', navigation);
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.locationAssign.mockImplementation(() => {
      signal = navigate();
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('releases only the actually aborted verified handoff and permits one explicit retry', async () => {
    await handoff();
    await act(async () => signal.abort(new DOMException('stopped', 'AbortError')));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(screen.getByLabelText('Email')).toHaveValue('test@example.com');
    fillAndSubmitCredentials();
    await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledTimes(2));
    expect(mocks.signInEmail).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  });

  it.each([
    'unrelated target',
    'same document',
    'wrong abort reason',
    'superseding navigation',
    'same-target replacement',
  ])('keeps the handoff locked for %s', async reason => {
    if (reason === 'unrelated target')
      mocks.locationAssign.mockImplementation(() => {
        signal = navigate('http://localhost/en/other');
      });
    if (reason === 'same document')
      mocks.locationAssign.mockImplementation(() => {
        signal = navigate('http://localhost/en/member', true);
      });
    await handoff();
    await act(async () => {
      signal.abort(
        new DOMException('stopped', reason === 'wrong abort reason' ? 'NetworkError' : 'AbortError')
      );
      if (reason === 'superseding navigation') navigate('http://localhost/en/other');
      if (reason === 'same-target replacement') navigate();
    });
    fireEvent.submit(screen.getByTestId('login-form'));
    expect(mocks.signInEmail).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  });

  it('does not release a later handoff from an earlier stopped signal', async () => {
    await handoff();
    const old = signal;
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
    fillAndSubmitCredentials();
    await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledTimes(2));
    await act(async () => old.abort(new DOMException('stopped', 'AbortError')));
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  });

  it.each(['unsupported', 'throwing observer'])(
    'preserves normal assign and pending protection with %s',
    async mode => {
      if (mode === 'unsupported') vi.stubGlobal('navigation', undefined);
      else
        vi.spyOn(navigation, 'addEventListener').mockImplementation(() => {
          throw Error('synthetic observer failure');
        });
      await handoff();
      await act(async () => signal.abort(new DOMException('stopped', 'AbortError')));
      expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
      expect(mocks.signInEmail).toHaveBeenCalledOnce();
      expect(mocks.locationAssign).toHaveBeenCalledOnce();
    }
  );

  it('disposes a signal on pagehide without resetting the handoff', async () => {
    await handoff();
    fireEvent(window, new PageTransitionEvent('pagehide', { persisted: true }));
    await act(async () => signal.abort(new DOMException('stopped', 'AbortError')));
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  it('disposes signal listeners if assign synchronously fails', async () => {
    const remove = vi.spyOn(navigation, 'removeEventListener');
    mocks.locationAssign.mockImplementationOnce(() => {
      signal = navigate();
      throw Error('synthetic assign failure');
    });
    render(<LoginForm />);
    fillAndSubmitCredentials();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled());
    expect(remove).toHaveBeenCalledWith('navigate', expect.any(Function));
    await act(async () => signal.abort(new DOMException('stopped', 'AbortError')));
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });

  it('cleans up its passive observer when the form unmounts', async () => {
    const remove = vi.spyOn(navigation, 'removeEventListener');
    const view = render(<LoginForm />);
    fillAndSubmitCredentials();
    await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledOnce());
    view.unmount();
    expect(remove).toHaveBeenCalledWith('navigate', expect.any(Function));
    await act(async () => signal.abort(new DOMException('stopped', 'AbortError')));
    expect(mocks.signInEmail).toHaveBeenCalledOnce();
  });
});
