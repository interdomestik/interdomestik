import type { Page, TestInfo } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';
import { loginAtDoor } from '../../e2e/fixtures/one-door.fixture';
import { createSignal } from '../../e2e/gate/signal-wait.fixture';

const { step } = vi.hoisted(() => ({
  step: vi.fn((_name: string, run: () => Promise<unknown>) => run()),
}));

vi.mock('@playwright/test', async importOriginal => ({
  ...(await importOriginal<typeof import('@playwright/test')>()),
  test: { extend: vi.fn(), step },
}));
vi.mock('@interdomestik/database', () => ({
  E2E_PASSWORD: 'synthetic-password',
  E2E_USER_IDS: { KS_ADMIN: 'seed-admin' },
  E2E_USERS: { KS_ADMIN: { email: 'admin@example.invalid' } },
}));
vi.mock('../../e2e/fixtures/one-door-data.fixture', () => ({
  requireDoorActor: vi.fn(async () => ({
    id: 'seed-admin',
    tenantId: 'tenant_ks',
    role: 'tenant_admin',
    branchId: null,
  })),
}));
vi.mock('../../e2e/utils/navigation', () => ({ gotoApp: vi.fn() }));

const origin = 'http://ida.example.invalid';
const phase = 'Complete one-door sign-in';

function startLogin() {
  const signIn = createSignal<{ status: () => number }>();
  const redirect = createSignal<void>();
  const waitingForRedirect = createSignal<void>();
  const submitted = createSignal<void>();
  const click = vi.fn(async () => submitted.resolve());
  const visibility = { click: vi.fn() };
  const locator = { _apiName: 'Locator', _expect: vi.fn(async () => ({ matches: true })) };
  const password = {
    ...locator,
    locator: () => ({ getByRole: () => visibility }),
    getAttribute: vi.fn().mockResolvedValueOnce('text').mockResolvedValue('password'),
    fill: vi.fn(),
  };
  const email = { ...locator, fill: vi.fn() };
  const waitForResponse = vi.fn(() => signIn.promise);
  const waitForURL = vi.fn(() => {
    waitingForRedirect.resolve();
    return redirect.promise;
  });
  const get = vi.fn(async () => ({
    status: () => 200,
    json: async () => ({
      user: { id: 'seed-admin', tenantId: 'tenant_ks', role: 'tenant_admin', branchId: null },
    }),
  }));
  const page = {
    getByTestId: (id: string) =>
      ({ 'login-submit': { click }, 'login-email': email, 'login-password': password })[id],
    waitForResponse,
    waitForURL,
    request: { get },
    url: () => `${origin}/sq/admin`,
  } as unknown as Page;
  const info = {
    timeout: 60_000,
    _deadline: () => ({ deadline: Number.POSITIVE_INFINITY }),
  } as unknown as TestInfo;
  const login = loginAtDoor(page, origin, 'sq', 'KS_ADMIN', info);
  return { login, signIn, redirect, waitingForRedirect, submitted, click, waitForResponse, get };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('registers the sign-in response before clicking and reads the session once after redirect', async () => {
  const { login, signIn, redirect, waitingForRedirect, submitted, click, waitForResponse, get } =
    startLogin();

  await Promise.race([submitted.promise, login]);
  expect(waitForResponse).toHaveBeenCalledBefore(click);
  expect(get).not.toHaveBeenCalled();
  signIn.resolve({ status: () => 200 });
  await Promise.race([waitingForRedirect.promise, login]);
  expect(get).not.toHaveBeenCalled();

  redirect.resolve();
  await login;

  expect(get).toHaveBeenCalledExactlyOnceWith(
    `${origin}/api/auth/get-session`,
    expect.objectContaining({ timeout: expect.any(Number) })
  );
  expect(step).toHaveBeenCalledExactlyOnceWith(phase, expect.any(Function));
});

it('fails the named phase before the test deadline if sign-in never redirects', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const { login, signIn, waitingForRedirect, get } = startLogin();
  const outcome = vi.fn();
  void login.then(() => outcome('completed'), outcome);
  signIn.resolve({ status: () => 200 });
  await Promise.race([waitingForRedirect.promise, login]);

  await vi.advanceTimersByTimeAsync(30_000);

  expect(outcome).toHaveBeenCalledExactlyOnceWith(new Error(`${phase} timed out`));
  expect(get).not.toHaveBeenCalled();
});
