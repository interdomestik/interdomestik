import { render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearNeutralHostOverrides,
  COUNTRY_ALIAS_CONTEXT,
  NON_NEUTRAL_REQUEST_HOST,
  renderLoginPage,
  restoreNeutralHostEnv,
  snapshotNeutralHostEnv,
  throwNextRedirect,
} from './_core.entry-test-support';

import { getLoginEntryMocks } from './_core.entry-test-mocks';

import { getTranslations } from 'next-intl/server';

import LoginPage from './_core.entry';

const hoisted = getLoginEntryMocks();

const TARGET_SHA = 'a4508910f6eede25643f56659946e2502b66b019';
const TIMING_ENV_KEYS = [
  'COMMIT_SHA',
  'LOGIN_ENTRY_TIMING_TARGET_SHA',
  'LOGIN_ENTRY_TIMING_ISSUED_AT',
  'LOGIN_ENTRY_TIMING_EXPIRES_AT',
] as const;
const MUTABLE_ENV = process.env as Record<string, string | undefined>;
const originalEnv = new Map<string, string | undefined>();
const originalTimingEnv = new Map<string, string | undefined>();
const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

function enableTiming(): void {
  const issuedAt = Math.floor(performance.timeOrigin + performance.now()) - 1_000;
  MUTABLE_ENV.VERCEL_ENV = 'preview';
  MUTABLE_ENV.COMMIT_SHA = TARGET_SHA;
  MUTABLE_ENV.LOGIN_ENTRY_TIMING_TARGET_SHA = TARGET_SHA;
  MUTABLE_ENV.LOGIN_ENTRY_TIMING_ISSUED_AT = String(issuedAt);
  MUTABLE_ENV.LOGIN_ENTRY_TIMING_EXPIRES_AT = String(issuedAt + 600_000);
}

function timingLines(): string[] {
  return infoSpy.mock.calls.flatMap(([line]) =>
    typeof line === 'string' && line.includes('"event":"login_entry_timing"') ? [line] : []
  );
}

function expectTimingRecord(fields: Record<string, unknown>, durationKeys: string[]): void {
  const lines = timingLines();
  expect(lines).toHaveLength(1);
  const record = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
  const byName = (a: string, b: string): number => a.localeCompare(b);

  expect(Object.keys(record).sort(byName)).toEqual(
    ['event', 'v', ...Object.keys(fields), ...durationKeys].sort(byName)
  );
  expect(record).toMatchObject({ event: 'login_entry_timing', v: 1, ...fields });
  for (const key of durationKeys) {
    const value = record[key];
    expect(typeof value === 'number' && Number.isFinite(value) && value >= 0).toBe(true);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  snapshotNeutralHostEnv(originalEnv);
  // An ambient configured host could otherwise make the request host an admitted neutral entry.
  clearNeutralHostOverrides();
  delete MUTABLE_ENV.VERCEL_ENV;
  for (const key of TIMING_ENV_KEYS) {
    originalTimingEnv.set(key, MUTABLE_ENV[key]);
    delete MUTABLE_ENV[key];
  }
  infoSpy.mockImplementation(() => {});
  hoisted.getSessionSafeMock.mockResolvedValue(null);
  hoisted.bootstrapRedirectMock.mockReturnValue(null);
  hoisted.redirectMock.mockImplementation(throwNextRedirect);
  hoisted.requestHeadersMock.mockResolvedValue(new Headers({ host: NON_NEUTRAL_REQUEST_HOST }));
  hoisted.resolveTenantContextFromRequestMock.mockResolvedValue(COUNTRY_ALIAS_CONTEXT);
});

afterEach(() => {
  restoreNeutralHostEnv(originalEnv);
  for (const [key, value] of originalTimingEnv) {
    if (value === undefined) {
      delete MUTABLE_ENV[key];
    } else {
      MUTABLE_ENV[key] = value;
    }
  }
});

afterAll(() => infoSpy.mockRestore());

describe('LoginPage entry timing', () => {
  it('stays silent and renders unchanged while disabled by default', async () => {
    render(await renderLoginPage(LoginPage, {}));

    expect(screen.getByTestId('auth-ready')).toBeInTheDocument();
    expect(screen.getByText('login-form')).toBeInTheDocument();
    expect(hoisted.getSessionSafeMock).toHaveBeenCalledExactlyOnceWith('LoginPage');
    expect(timingLines()).toEqual([]);
  });

  it('records every bracketed phase of a rendered entry without extra producer calls', async () => {
    enableTiming();

    render(await renderLoginPage(LoginPage, {}));

    expect(screen.getByTestId('auth-ready')).toBeInTheDocument();
    expect(screen.getByTestId('auth-portal-hero')).toHaveTextContent(
      'auth.login.portal.panelTitle'
    );
    expect(hoisted.loginFormMock).toHaveBeenCalledWith({
      githubOAuthEnabled: expect.any(Boolean),
      tenantId: 'tenant_ks',
    });
    expect(hoisted.savedDraftSignInMock).toHaveBeenCalledWith({ locale: 'en' });
    expect(hoisted.getSessionSafeMock).toHaveBeenCalledExactlyOnceWith('LoginPage');
    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledExactlyOnceWith('en');
    expect(hoisted.requestHeadersMock).toHaveBeenCalledTimes(1);
    expect(hoisted.resolveTenantContextFromRequestMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getTranslations)).toHaveBeenCalledTimes(1);
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
    expectTimingRecord({ session_found: false, entry_returned: true }, [
      'entry_ms',
      'session_ms',
      'tenant_context_ms',
      'translations_ms',
    ]);
  });

  it.each([
    { role: 'staff', searchParams: {}, target: '/en/staff/claims' },
    {
      role: 'member',
      searchParams: { next: '/en/member/claims/9' },
      target: '/en/member/claims/9',
    },
  ])(
    'marks the $role authenticated redirect and rethrows the original error',
    async ({ role, searchParams, target }) => {
      enableTiming();
      const redirectError = new Error('redirect sentinel');
      hoisted.getSessionSafeMock.mockResolvedValue({ user: { role } });
      hoisted.redirectMock.mockImplementation(() => {
        throw redirectError;
      });

      await expect(renderLoginPage(LoginPage, { searchParams })).rejects.toBe(redirectError);

      expect(hoisted.redirectMock).toHaveBeenCalledExactlyOnceWith(target);
      expect(hoisted.getSessionSafeMock).toHaveBeenCalledExactlyOnceWith('LoginPage');
      expect(hoisted.requestHeadersMock).not.toHaveBeenCalled();
      expect(hoisted.resolveTenantContextFromRequestMock).not.toHaveBeenCalled();
      expectTimingRecord({ session_found: true, redirect_requested: true }, [
        'entry_ms',
        'session_ms',
      ]);
    }
  );

  it('marks the tenant bootstrap redirect after the tenant context phase', async () => {
    enableTiming();
    const redirectError = new Error('bootstrap sentinel');
    hoisted.bootstrapRedirectMock.mockReturnValue('/en/login/tenant-context?tenantId=tenant_mk');
    hoisted.redirectMock.mockImplementation(() => {
      throw redirectError;
    });

    await expect(
      renderLoginPage(LoginPage, { searchParams: { tenantId: 'tenant_mk' } })
    ).rejects.toBe(redirectError);

    expect(hoisted.redirectMock).toHaveBeenCalledExactlyOnceWith(
      '/en/login/tenant-context?tenantId=tenant_mk'
    );
    expect(hoisted.requestHeadersMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getTranslations)).not.toHaveBeenCalled();
    expectTimingRecord({ session_found: false, redirect_requested: true }, [
      'entry_ms',
      'session_ms',
      'tenant_context_ms',
    ]);
  });

  it('omits an unfinished session phase when the session read rejects', async () => {
    enableTiming();
    const failure = new Error('session failure');
    hoisted.getSessionSafeMock.mockRejectedValueOnce(failure);

    await expect(renderLoginPage(LoginPage, {})).rejects.toBe(failure);

    expect(hoisted.requestHeadersMock).not.toHaveBeenCalled();
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
    expectTimingRecord({}, ['entry_ms']);
  });

  it('omits an unfinished tenant context phase when the resolver rejects', async () => {
    enableTiming();
    const failure = new Error('tenant failure');
    hoisted.resolveTenantContextFromRequestMock.mockRejectedValueOnce(failure);

    await expect(renderLoginPage(LoginPage, {})).rejects.toBe(failure);

    expect(vi.mocked(getTranslations)).not.toHaveBeenCalled();
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
    expectTimingRecord({ session_found: false }, ['entry_ms', 'session_ms']);
  });

  it('never logs role, tenant, query, cookie or host values', async () => {
    enableTiming();
    hoisted.getSessionSafeMock.mockResolvedValue({ user: { role: 'promoter' } });
    hoisted.requestHeadersMock.mockResolvedValue(
      new Headers({ host: NON_NEUTRAL_REQUEST_HOST, cookie: 'session=sentinel_cookie' })
    );
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValue({
      kind: 'tenant',
      tenantId: 'tenant_sentinel_private',
      source: 'cookie_sentinel',
    });

    render(
      await renderLoginPage(LoginPage, {
        searchParams: { tenantId: 'tenant_sentinel_query', plan: 'plan_sentinel', next: '/en/x' },
      })
    );

    expect(hoisted.loginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_sentinel_private' })
    );
    expect(timingLines().join('\n')).not.toMatch(/sentinel|promoter|localhost/i);
    expectTimingRecord({ session_found: true, entry_returned: true }, [
      'entry_ms',
      'session_ms',
      'tenant_context_ms',
      'translations_ms',
    ]);
  });

  it('keeps the page result and original redirect when the logger throws', async () => {
    enableTiming();
    infoSpy.mockImplementation(() => {
      throw new Error('log failure');
    });

    render(await renderLoginPage(LoginPage, {}));
    expect(screen.getByTestId('auth-ready')).toBeInTheDocument();

    const redirectError = new Error('redirect sentinel');
    hoisted.getSessionSafeMock.mockResolvedValue({ user: { role: 'staff' } });
    hoisted.redirectMock.mockImplementation(() => {
      throw redirectError;
    });

    await expect(renderLoginPage(LoginPage, {})).rejects.toBe(redirectError);
    expect(infoSpy).toHaveBeenCalledTimes(2);
  });
});
