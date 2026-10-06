import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loginFormMocks as mocks,
  resetLoginFormHarness,
  fillAndSubmitCredentials,
} from '@/test/login-form-harness';
import { LoginForm } from './login-form';

const monitoring = vi.hoisted(() => ({ finish: vi.fn(), start: vi.fn() }));
vi.mock('@/lib/observability/critical-action', () => ({
  startCriticalAction: (...args: unknown[]) => {
    monitoring.start(...args);
    return { finish: monitoring.finish };
  },
}));

beforeEach(resetLoginFormHarness);

describe('login critical-action semantics', () => {
  it('waits for role synchronization before recording navigation_started rather than route success', async () => {
    mocks.signInEmail.mockResolvedValue({ error: null });
    let release!: (value: { role: string; hasAdminAccess: boolean }) => void;
    mocks.readLoginSession.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      })
    );
    render(<LoginForm />);
    fillAndSubmitCredentials();
    await waitFor(() => expect(mocks.readLoginSession).toHaveBeenCalledOnce());
    expect(monitoring.start).toHaveBeenCalledWith('login_submit');
    expect(monitoring.finish).not.toHaveBeenCalled();
    release({ role: 'user', hasAdminAccess: false });
    await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledWith('/en/member'));
    expect(monitoring.finish).toHaveBeenCalledOnce();
    expect(monitoring.finish).toHaveBeenCalledWith('navigation_started');
    expect(monitoring.finish.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.locationAssign.mock.invocationCallOrder[0]
    );
  });

  it.each([
    ['invalid_credentials', 'rejected'],
    ['admin_permission', 'rejected'],
    ['session_error', 'unexpected'],
    ['role_timeout', 'unexpected'],
    ['unsupported_role', 'unexpected'],
  ])('finishes %s as %s with no credential or error payload', async (failure, outcome) => {
    mocks.signInEmail.mockResolvedValue({
      error: failure === 'invalid_credentials' ? { message: 'Invalid credentials' } : null,
    });
    if (failure === 'admin_permission')
      mocks.readLoginSession.mockResolvedValue({ role: 'admin', hasAdminAccess: false });
    if (failure === 'session_error')
      mocks.readLoginSession.mockRejectedValueOnce(Error('private raw failure'));
    if (failure === 'role_timeout')
      mocks.readLoginSession.mockResolvedValue({ hasAdminAccess: false });
    if (failure === 'unsupported_role')
      mocks.readLoginSession.mockResolvedValue({ role: 'unknown', hasAdminAccess: false });
    render(<LoginForm />);
    fillAndSubmitCredentials();
    await waitFor(() => expect(monitoring.finish).toHaveBeenCalledWith(outcome));
    expect(monitoring.finish).toHaveBeenCalledOnce();
    expect(mocks.locationAssign).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        failure === 'invalid_credentials'
          ? 'Invalid credentials'
          : failure === 'unsupported_role'
            ? 'An error occurred (Unsupported account role)'
            : 'An error occurred'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(screen.getByLabelText('Email')).toBeEnabled();
    expect(screen.getByLabelText('Password')).toBeEnabled();
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.readLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });
    fillAndSubmitCredentials();
    await waitFor(() => expect(mocks.locationAssign).toHaveBeenCalledWith('/en/member'));
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    expect(monitoring.start).toHaveBeenCalledTimes(2);
    expect(monitoring.finish).toHaveBeenCalledTimes(2);
  });
});
