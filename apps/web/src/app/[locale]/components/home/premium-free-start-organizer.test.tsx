import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '@/messages/en/freeStart.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

// prettier-ignore
const hoisted = vi.hoisted(() => ({ create: vi.fn(), deleteDraft: vi.fn(), generate: vi.fn(), list: vi.fn(), resume: vi.fn(), send: vi.fn(), submit: vi.fn(), update: vi.fn(), verify: vi.fn() }));
// prettier-ignore
vi.mock('next-intl', () => ({ useTranslations: createUseTranslationsMock(() => ({ common: { errors: { retry: 'Please try again.' } }, freeStart: enMessages.freeStart })) }));
// prettier-ignore
vi.mock('@/i18n/routing', () => ({ Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));
// prettier-ignore
vi.mock('@/lib/support-contacts', () => ({ getSupportContacts: () => ({ telHref: 'tel:+38349900600' }) }));
// prettier-ignore
vi.mock('@/lib/analytics', async () => { const actual = await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics'); return { ...actual, CommercialFunnelEvents: { ...actual.CommercialFunnelEvents, freeStartCompleted: vi.fn() } }; });
// prettier-ignore
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: (...args: unknown[]) => hoisted.submit(...args) }));
// prettier-ignore
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: (...args: unknown[]) => hoisted.generate(...args) }));
// prettier-ignore
vi.mock('@/actions/free-start-drafts', () => ({ createFreeStartDraft: (...args: unknown[]) => hoisted.create(...args), deleteFreeStartDraft: (...args: unknown[]) => hoisted.deleteDraft(...args), listFreeStartDrafts: (...args: unknown[]) => hoisted.list(...args), resumeFreeStartDraft: (...args: unknown[]) => hoisted.resume(...args), updateFreeStartDraft: (...args: unknown[]) => hoisted.update(...args) }));
// prettier-ignore
vi.mock('@/lib/auth-client', () => ({ authClient: { emailOtp: { sendVerificationOtp: (...args: unknown[]) => hoisted.send(...args) }, signIn: { emailOtp: (...args: unknown[]) => hoisted.verify(...args) } } }));

import { writeAnonymousDraft } from './free-start-intake-shell/anonymous-draft-recovery';
import { getContinueLabel } from './free-start-intake-shell/helpers';
import { FreeStartIntakeShell } from './free-start-intake-shell/index';
import type { FreeStartCopy } from './free-start-intake-shell/types';

const translate = ((key: string) => {
  return key.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, enMessages.freeStart) as string;
}) as FreeStartCopy;

describe('premium Free Start organizer', () => {
  // prettier-ignore
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); hoisted.submit.mockReset(); hoisted.generate.mockReset(); hoisted.create.mockReset().mockResolvedValue({ ok: false, code: 'authRequired' }); hoisted.send.mockReset().mockResolvedValue({ data: {}, error: null }); hoisted.verify.mockReset().mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null }); });

  it('continues a selected situation in the premium organizer without asking twice', () => {
    render(
      <FreeStartIntakeShell
        continueHref="/pricing"
        initialCategory="injury"
        locale="en"
        tenantId="tenant_public"
      />
    );

    expect(screen.getByTestId('premium-free-start-organizer')).toHaveAttribute(
      'data-save-behavior',
      'explicit-only'
    );
    expect(
      screen.getByRole('heading', { name: 'Gather the key facts in one place.' })
    ).toBeInTheDocument();
    expect(screen.getByText('You are continuing with:')).toBeInTheDocument();
    expect(screen.getByText('Personal injury')).toBeInTheDocument();
    expect(screen.queryByTestId('free-start-category-injury')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What happened?')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-trust-boundary')).toHaveTextContent(
      'nothing saves automatically'
    );
  });

  it('keeps the direct-entry category fallback available', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="en" tenantId="tenant_public" />);

    expect(screen.getByTestId('free-start-category-vehicle')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-property')).toBeInTheDocument();
    expect(screen.getByTestId('free-start-category-injury')).toBeInTheDocument();
  });

  it('keeps the generated-pack CTA aligned with high confidence guidance', () => {
    expect(getContinueLabel(translate, '/pricing', 'high')).toBe(
      'Join Asistenca for a team review'
    );
  });

  // prettier-ignore
  it('blocks secure actions until a pending device discard settles', async () => { writeAnonymousDraft(localStorage, { category: 'property', draft: { counterparty: 'Insurer', desiredOutcome: 'repair', incidentDate: '2026-07-15', issueType: 'water_damage', summary: 'Water damaged two rooms.' }, resumeStep: 'preview' }, null); const request = vi.fn((_name, options: { signal: AbortSignal }, callback: () => unknown) => request.mock.calls.length === 1 ? Promise.resolve(callback()) : new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }))); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); render(<FreeStartIntakeShell continueHref="/pricing" locale="en" neutralOtpHost={globalThis.location.host} tenantId="tenant_public" />); fireEvent.click(await screen.findByRole('button', { name: 'Discard from this device' })); await waitFor(() => expect(request).toHaveBeenCalledTimes(2)); expect(screen.getByTestId('free-start-recovery-secure-actions')).toHaveAttribute('inert'); });

  // prettier-ignore
  it('prevents a sibling storage event from completing a pending OTP save', async () => { let finishVerify!: () => void; hoisted.verify.mockReturnValue(new Promise(resolve => { finishVerify = () => resolve({ data: { user: { id: 'user-a' } }, error: null }); })); Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_name, _options, callback) => callback()) } }); render(<FreeStartIntakeShell continueHref="/pricing" initialCategory="property" locale="en" neutralOtpHost={globalThis.location.host} tenantId="tenant_public" />); await waitFor(() => expect(localStorage).toHaveLength(1)); fireEvent.click(await screen.findByRole('button', { name: 'Save securely' })); fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'owner@example.com' } }); fireEvent.click(screen.getByRole('button', { name: 'Send code' })); await waitFor(() => expect(hoisted.send).toHaveBeenCalledOnce()); fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' })); await waitFor(() => expect(hoisted.verify).toHaveBeenCalledOnce()); const record = JSON.parse(localStorage.getItem('interdomestik_free_start_recovery_v1')!); record.draft.summary = 'Newer sibling facts.'; record.updatedAt = new Date(Date.parse(record.updatedAt) + 1).toISOString(); record.expiresAt = new Date(Date.parse(record.expiresAt) + 1).toISOString(); localStorage.setItem('interdomestik_free_start_recovery_v1', JSON.stringify(record)); const event = new Event('storage') as StorageEvent; Object.defineProperties(event, { key: { value: 'interdomestik_free_start_recovery_v1' }, storageArea: { value: localStorage } }); globalThis.dispatchEvent(event); await act(async () => finishVerify()); expect(hoisted.create).toHaveBeenCalledOnce(); });
});
