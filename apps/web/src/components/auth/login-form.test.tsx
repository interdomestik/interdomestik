import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loginFormMocks as mocks,
  resetLoginFormHarness,
  fillAndSubmitCredentials,
  setLoginFormLocation,
} from '@/test/login-form-harness';
import { LoginForm } from './login-form';

describe('LoginForm', () => {
  beforeEach(resetLoginFormHarness);

  it('renders the login form correctly', () => {
    render(<LoginForm />);

    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Remember me')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
  });

  it('renders GitHub OAuth entry when enabled', () => {
    render(<LoginForm githubOAuthEnabled />);

    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('submits form with email and password', async () => {
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.readLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mocks.signInEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(mocks.locationAssign).toHaveBeenCalledWith('/en/member');
    });
  });

  it('redirects admins to canonical route when access is granted', async () => {
    mocks.signInEmail.mockResolvedValue({ error: null });
    let release!: (result: { role: string; hasAdminAccess: boolean }) => void;
    mocks.readLoginSession.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      })
    );

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => expect(mocks.readLoginSession).toHaveBeenCalledOnce());
    expect(mocks.locationAssign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    release({ role: 'admin', hasAdminAccess: true });
    await waitFor(() => {
      expect(mocks.locationAssign).toHaveBeenCalledWith('/en/admin/overview');
    });
    expect(mocks.readLoginSession).toHaveBeenCalledOnce();
  });

  it('does not redirect admins without access', async () => {
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.readLoginSession.mockResolvedValue({ role: 'admin', hasAdminAccess: false });

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mocks.locationAssign).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('An error occurred')).toBeInTheDocument();
    });
  });

  it('shows an error when canonical redirect is unavailable', async () => {
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.readLoginSession.mockResolvedValue({ role: 'unknown', hasAdminAccess: false });

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mocks.locationAssign).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/unsupported account role/i)).toBeInTheDocument();
    });

    expect(mocks.emitAuthTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'staff_post_login_redirect_failed',
        reason: 'unsupported_redirect_target',
        pathname: '/en/login',
      })
    );
  });

  it('emits telemetry when role sync never resolves after the retry window', async () => {
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.readLoginSession.mockResolvedValue({ hasAdminAccess: false });

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(screen.getByText('An error occurred')).toBeInTheDocument();
    });

    expect(mocks.locationAssign).not.toHaveBeenCalled();
    expect(mocks.emitAuthTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'staff_post_login_redirect_failed',
        reason: 'post_login_sync_timeout',
        pathname: '/en/login',
      })
    );
    expect(mocks.readLoginSession).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['invalid_credentials', 'Invalid credentials'],
    ['session_error', 'An error occurred'],
  ])('displays a fail-closed error for %s', async (kind, message) => {
    mocks.signInEmail.mockResolvedValue({
      error: kind === 'invalid_credentials' ? { message } : null,
    });
    if (kind === 'session_error')
      mocks.readLoginSession.mockRejectedValueOnce(new Error('Synthetic failure'));
    render(<LoginForm />);
    fillAndSubmitCredentials('test@example.com', 'wrongpassword');
    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    expect(mocks.locationAssign).not.toHaveBeenCalled();
  });

  it('shows loading state during submission', async () => {
    mocks.signInEmail.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ error: null }), 100))
    );
    mocks.readLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
  });

  it('uses resolved onboarding for GitHub OAuth with server tenant context', async () => {
    const originalLocation = globalThis.location;
    setLoginFormLocation({ origin: 'http://localhost:3000' });

    render(<LoginForm githubOAuthEnabled tenantId="tenant_ks" />);
    const githubButton = screen.getByText('GitHub');
    fireEvent.click(githubButton);

    await waitFor(() => {
      expect(mocks.signInSocial).toHaveBeenCalledWith({
        provider: 'github',
        callbackURL: 'http://localhost:3000/en/login',
        additionalData: { onboarding: { tenant: 'tenant_ks', mode: 'resolved' } },
      });
    });

    setLoginFormLocation(originalLocation);
  });

  it('preserves the GitHub callback and defers a neutral tenant hint', async () => {
    const originalLocation = globalThis.location;
    mocks.searchParams = new URLSearchParams('tenantId=tenant_ks&next=%2Fen%2Fmember%2Fclaims');
    setLoginFormLocation({
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/en/login?tenantId=tenant_ks&next=%2Fen%2Fmember%2Fclaims',
    });

    render(<LoginForm githubOAuthEnabled />);

    fireEvent.click(screen.getByText('GitHub'));

    await waitFor(() => {
      expect(mocks.signInSocial).toHaveBeenCalledWith({
        provider: 'github',
        callbackURL:
          'http://localhost:3000/en/login?tenantId=tenant_ks&next=%2Fen%2Fmember%2Fclaims',
        additionalData: { onboarding: { tenant: 'tenant_ks', mode: 'deferred' } },
      });
    });

    setLoginFormLocation(originalLocation);
  });

  it('has forgot password link', () => {
    render(<LoginForm />);

    const forgotLink = screen.getByText('Forgot password?');
    expect(forgotLink.closest('a')).toHaveAttribute('href', '/forgot-password');
  });

  it('keeps password helper actions keyboard-accessible', () => {
    render(<LoginForm />);

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });

  it('has register link', () => {
    render(<LoginForm />);

    const registerLink = screen.getByText('Register');
    expect(registerLink.closest('a')).toHaveAttribute('href', '/pricing');
  });

  it('preserves selected plan in register link continuity', () => {
    mocks.searchParams = new URLSearchParams('tenantId=tenant_ks&plan=standard');
    render(<LoginForm />);

    const registerLink = screen.getByText('Register');
    expect(registerLink.closest('a')).toHaveAttribute('href', '/pricing?plan=standard');
  });

  it('redirects members to selected plan flow after login when plan query is present', async () => {
    mocks.searchParams = new URLSearchParams('plan=standard');
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.readLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mocks.locationAssign).toHaveBeenCalledWith('/en/pricing?plan=standard');
    });
  });

  it('redirects to a safe next path after login when it matches the authenticated surface', async () => {
    mocks.searchParams = new URLSearchParams('next=%2Fen%2Fmember%2Fclaims');
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.readLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mocks.locationAssign).toHaveBeenCalledWith('/en/member/claims');
    });
  });

  it('falls back to the canonical route when next targets a different protected surface', async () => {
    mocks.searchParams = new URLSearchParams('next=%2Fen%2Fadmin%2Foverview');
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.readLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });

    render(<LoginForm />);

    fillAndSubmitCredentials();

    await waitFor(() => {
      expect(mocks.locationAssign).toHaveBeenCalledWith('/en/member');
    });
  });
});
