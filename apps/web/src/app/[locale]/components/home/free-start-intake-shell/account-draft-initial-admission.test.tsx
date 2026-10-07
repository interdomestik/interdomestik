import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '@/messages/en/freeStart.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import type { DraftAccount } from './draft-lifecycle-editor';
import { FreeStartIntakeShell } from './index';
import {
  account,
  blank,
  held,
  other,
  saved,
  setup,
} from './tests/account-draft-ownership-fixtures';

// prettier-ignore
const actions = vi.hoisted(() => ({ account: vi.fn(), create: vi.fn(), update: vi.fn(), list: vi.fn(), resume: vi.fn(), remove: vi.fn(), send: vi.fn(), verify: vi.fn(), submit: vi.fn(), generate: vi.fn() }));
// prettier-ignore
vi.mock('next-intl', () => ({ useTranslations: createUseTranslationsMock(() => ({ common: { errors: { retry: 'Please try again.' } }, freeStart: enMessages.freeStart })) }));
// prettier-ignore
vi.mock('@/i18n/routing', () => ({ Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));
// prettier-ignore
vi.mock('@/lib/support-contacts', () => ({ getSupportContacts: () => ({ telHref: 'tel:+38349900600' }) }));
// prettier-ignore
vi.mock('@/lib/analytics', async () => { const actual = await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics'); return { ...actual, CommercialFunnelEvents: { ...actual.CommercialFunnelEvents, freeStartCompleted: vi.fn() } }; });
// prettier-ignore
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: (...args: unknown[]) => actions.submit(...args) }));
// prettier-ignore
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: (...args: unknown[]) => actions.generate(...args) }));
// prettier-ignore
vi.mock('@/actions/free-start-drafts', () => ({ getFreeStartDraftAccount: actions.account, createFreeStartDraft: actions.create, updateFreeStartDraft: actions.update, listFreeStartDrafts: actions.list, resumeFreeStartDraft: actions.resume, deleteFreeStartDraft: actions.remove }));
// prettier-ignore
vi.mock('@/lib/auth-client', () => ({ authClient: { emailOtp: { sendVerificationOtp: (...args: unknown[]) => actions.send(...args) }, signIn: { emailOtp: (...args: unknown[]) => actions.verify(...args) } } }));

const SIGNED_OUT = { ok: false, code: 'authRequired' };
const { expectedContext } = account;
const unverified: DraftAccount = { ...account, emailVerified: false };
const tenantMk: DraftAccount = {
  ...account,
  expectedContext: { ...expectedContext, tenantId: 'tenant_mk' },
};
const listed = { ok: true, items: [saved], nextCursor: null, expectedContext };
const browserCopy = {
  category: 'property' as const,
  draft: { ...blank, summary: 'Browser notes.' },
  resumeStep: 'details' as const,
};
const managerStart = { account: null, category: null, draft: blank, step: 'category' as const };
type Hook = ReturnType<typeof setup>;

beforeEach(() => {
  for (const mock of Object.values(actions)) mock.mockReset();
  localStorage.clear();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue(listed);
  actions.create.mockResolvedValue({ ok: true, draft: saved });
  actions.resume.mockResolvedValue({ ok: true, draft: saved, expectedContext });
  actions.send.mockResolvedValue({ data: {}, error: null });
});

/** Starts the required OTP intent; its settlement is observed rather than assumed. */
function verify(hook: Hook): Promise<boolean> {
  let verifying!: Promise<void>;
  act(() => {
    verifying = hook.result.current.onVerified();
  });
  return verifying.then(
    () => true,
    () => false
  );
}
/** Signed-out Manage, then OTP: the held first list meets late same-owner presentation props. */
async function manageThroughOtp(hook: Hook): Promise<boolean> {
  const list = held<unknown>();
  actions.account.mockResolvedValueOnce(SIGNED_OUT);
  actions.list.mockReturnValueOnce(list.promise);
  await act(() => hook.result.current.openManage());
  const settlement = verify(hook);
  await waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
  hook.rerender({ ...hook.props, account: unverified });
  await act(() => Promise.resolve());
  hook.rerender({ ...hook.props, account });
  await act(async () => {
    list.resolve(listed);
    await settlement;
  });
  return settlement;
}
function expectNoImplicitWrites(hook: Hook, resets: number): void {
  expect(actions.resume).not.toHaveBeenCalled();
  expect(actions.create).not.toHaveBeenCalled();
  expect(actions.update).not.toHaveBeenCalled();
  expect(hook.onReset).toHaveBeenCalledTimes(resets);
}
async function leased(hook: Hook) {
  const pending = hook.result.current.startRestoration();
  await act(async () => {
    await pending;
  });
  return pending;
}
async function expire(hook: Hook): Promise<void> {
  actions.account.mockResolvedValueOnce(SIGNED_OUT);
  await act(() => hook.result.current.openManage());
}

describe('initial anonymous OTP admission', () => {
  it('keeps the typed OTP email when the initial signed-out discovery settles', async () => {
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    render(
      <FreeStartIntakeShell
        continueHref="/pricing"
        initialCategory="property"
        locale="en"
        neutralOtpHost={globalThis.location.host}
        tenantId="tenant_public"
      />
    );
    fireEvent.click(await screen.findByTestId('free-start-save-entry-open'));
    fireEvent.change(screen.getByLabelText('Brief summary'), {
      target: { value: 'Water damaged two rooms.' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Save securely' }));
    await waitFor(() => expect(actions.account).toHaveBeenCalledOnce());
    const email = await screen.findByLabelText('Email address');
    fireEvent.change(email, { target: { value: 'owner@example.com' } });
    await act(async () => {
      discovery.resolve(SIGNED_OUT);
      await discovery.promise;
    });
    // The same mounted field keeps its value: no reset remounted the OTP entry.
    expect(screen.getByLabelText('Email address')).toBe(email);
    expect(email).toHaveValue('owner@example.com');
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
    expect(screen.getByTestId('free-start-save-status')).not.toHaveAttribute('data-state', 'saved');
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(actions.send).toHaveBeenCalledOnce());
    expect(actions.send.mock.calls[0]?.[0]).toMatchObject({ email: 'owner@example.com' });
  });
});

describe('truly anonymous signed-out verdicts', () => {
  it('confirms the anonymous state without a reset and still refuses', async () => {
    actions.account.mockResolvedValue(SIGNED_OUT);
    const hook = setup({ account: null });
    const { identityKey } = hook.result.current;
    await act(async () => {
      await expect(hook.result.current.openSave()).resolves.toBe(false);
    });
    expect(hook.result.current).toMatchObject({ identityKey, intent: 'save', verified: false });
    await act(async () => {
      await expect(hook.result.current.onVerified()).rejects.toThrow('secure_save_intent_failed');
    });
    expect(hook.result.current).toMatchObject({ identityKey, intent: 'save', active: null });
    expectNoImplicitWrites(hook, 0);
    expect(actions.list).not.toHaveBeenCalled();
  });
  it('still revokes a known unverified owner from props', async () => {
    const hook = setup({ account: unverified });
    const { identityKey } = hook.result.current;
    actions.account.mockResolvedValueOnce(SIGNED_OUT);
    await act(async () => {
      await expect(hook.result.current.openSave()).resolves.toBe(false);
    });
    expect(hook.result.current).toMatchObject({
      identityKey: identityKey + 1,
      intent: 'save',
      verified: false,
    });
    expectNoImplicitWrites(hook, 0);
  });
  it('still revokes a discovered unverified owner with an admitted list', async () => {
    const hook = setup({ account: null });
    actions.account.mockResolvedValueOnce({ ok: true, ...unverified });
    await act(async () => {
      await expect(hook.result.current.openManage()).resolves.toBe(true);
    });
    expect(hook.result.current).toMatchObject({ readAdmitted: true, items: [saved] });
    const { identityKey } = hook.result.current;
    actions.account.mockResolvedValueOnce(SIGNED_OUT);
    await act(async () => {
      await expect(hook.result.current.openSave()).resolves.toBe(false);
    });
    expect(hook.result.current).toMatchObject({
      identityKey: identityKey + 1,
      intent: 'save',
      verified: false,
      readAdmitted: false,
      items: [],
    });
    expectNoImplicitWrites(hook, 0);
  });
});

describe('first-owner manager read across same-owner presentation props', () => {
  it('keeps fresh rows for a fresh intake without implicit resume or writes', async () => {
    const hook = setup(managerStart);
    const { identityKey } = hook.result.current;
    await manageThroughOtp(hook);
    await waitFor(() => expect(hook.result.current.items).toEqual([saved]));
    expect(hook.result.current).toMatchObject({
      intent: 'manage',
      active: null,
      readAdmitted: true,
      verified: true,
      identityKey,
    });
    expectNoImplicitWrites(hook, 0);
  });
  it('keeps the held fresh rows after an accepted Start another', async () => {
    const hook = setup(managerStart);
    await act(async () => {
      await expect(hook.result.current.startAnother()).resolves.toBe(true);
    });
    hook.rerender({ ...hook.props, draft: { ...blank } });
    const { identityKey } = hook.result.current;
    await expect(manageThroughOtp(hook)).resolves.toBe(true);
    expect(actions.list).toHaveBeenCalledOnce();
    expect(hook.result.current).toMatchObject({
      intent: 'manage',
      active: null,
      items: [saved],
      readAdmitted: true,
      verified: true,
      identityKey,
    });
    expectNoImplicitWrites(hook, 1);
  });
  it('still drops the held read on an actual tenant change', async () => {
    const list = held<unknown>();
    actions.account.mockResolvedValueOnce(SIGNED_OUT);
    actions.list.mockReturnValueOnce(list.promise);
    const hook = setup(managerStart);
    await act(() => hook.result.current.openManage());
    const settlement = verify(hook);
    await waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    hook.rerender({ ...hook.props, account: tenantMk });
    await act(async () => {
      list.resolve(listed);
      await settlement;
    });
    expect(hook.result.current).toMatchObject({ intent: null, active: null, items: [] });
    expectNoImplicitWrites(hook, 1);
  });
});

describe('browser restoration lease refusal controls', () => {
  beforeEach(() => {
    actions.list.mockResolvedValue({ ...listed, items: [] });
  });
  it.each([
    ['an owner change', (hook: Hook) => hook.rerender({ ...hook.props, account: other })],
    ['a tenant change', (hook: Hook) => hook.rerender({ ...hook.props, account: tenantMk })],
    ['a newer deliberate operation', (hook: Hook) => act(() => hook.result.current.openManage())],
    ['an expired session', expire],
    ['lifecycle exit', (hook: Hook) => hook.unmount()],
  ])('refuses completion after %s', async (_name, interrupt) => {
    const hook = setup({ draft: blank });
    await waitFor(() => expect(hook.result.current.readAdmitted).toBe(true));
    const lease = await leased(hook);
    expect(lease).not.toBeNull();
    const { completeRestoration } = hook.result.current;
    await interrupt(hook);
    expect(lease !== null && completeRestoration(lease, browserCopy)).toBe(false);
    expect(actions.create).not.toHaveBeenCalled();
  });
  it('grants no lease while an unknown create refuses retirement', async () => {
    actions.create.mockRejectedValueOnce(new Error('response lost'));
    const hook = setup();
    await waitFor(() => expect(hook.result.current.state).toBe('error'));
    await expect(leased(hook)).resolves.toBeNull();
    expect(hook.onReset).not.toHaveBeenCalled();
    expect(actions.create).toHaveBeenCalledOnce();
  });
});
