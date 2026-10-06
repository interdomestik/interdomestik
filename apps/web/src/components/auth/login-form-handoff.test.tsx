import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loginFormMocks as mocks,
  resetLoginFormHarness,
  fillAndSubmitCredentials,
} from '@/test/login-form-harness';
import { LoginForm } from './login-form';

describe('LoginForm handoff lifecycle', () => {
  beforeEach(resetLoginFormHarness);

  it.each(['password', 'session'] as const)(
    'does not reset or duplicate active %s work on persisted restoration',
    async phase => {
      type Result = { error: null } | { role: string; hasAdminAccess: boolean };
      let release!: (value: Result) => void;
      const pending = new Promise<Result>(resolve => {
        release = resolve;
      });
      mocks.signInEmail.mockResolvedValue({ error: null });
      mocks.readLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });
      if (phase === 'password') mocks.signInEmail.mockReturnValueOnce(pending);
      else mocks.readLoginSession.mockReturnValueOnce(pending);
      render(<LoginForm />);
      fillAndSubmitCredentials();
      if (phase === 'session')
        await waitFor(() => expect(mocks.readLoginSession).toHaveBeenCalledOnce());
      fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
      fireEvent.submit(screen.getByTestId('login-form'));
      expect(mocks.signInEmail).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
      release(phase === 'password' ? { error: null } : { role: 'user', hasAdminAccess: false });
      await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledWith('/en/member'));
      expect(mocks.readLoginSession).toHaveBeenCalledOnce();
    }
  );

  it('resets only a completed handoff on persisted pageshow and permits one new attempt', async () => {
    mocks.signInEmail.mockResolvedValue({ error: null });
    render(<LoginForm />);
    fillAndSubmitCredentials();
    await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledOnce());
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: false }));
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(screen.getByLabelText('Email')).toHaveValue('test@example.com');
    fillAndSubmitCredentials();
    await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledTimes(2));
    expect(mocks.signInEmail).toHaveBeenCalledTimes(2);
    expect(mocks.readLoginSession).toHaveBeenCalledTimes(2);
  });

  it('releases busy state after a synchronous navigation failure and allows retry', async () => {
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.locationAssign.mockImplementationOnce(() => {
      throw Error('synthetic assign failure');
    });
    render(<LoginForm />);
    fillAndSubmitCredentials();
    await waitFor(() => expect(screen.getByText('An error occurred')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(screen.getByLabelText('Email')).toBeEnabled();
    fillAndSubmitCredentials();
    await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('An error occurred')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  });

  it('removes the owned restoration listener when the form unmounts', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<LoginForm />);
    const listeners = add.mock.calls.filter(([type]) => type === 'pageshow');
    expect(listeners).toHaveLength(1);
    view.unmount();
    expect(remove).toHaveBeenCalledWith('pageshow', listeners[0][1]);
    add.mockRestore();
    remove.mockRestore();
  });
});
