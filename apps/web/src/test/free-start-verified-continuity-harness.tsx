/**
 * Mounted-tree support for the verified-save continuity suite.
 *
 * Holds the one reactive boundary the suite scripts, the static seam registrations, one real
 * vehicle report fixture and the deliberate save journey a customer actually walks. It must never
 * import the system under test: the suite imports this module first so these registrations are in
 * place before the runtime graph initializes. Every scenario assertion stays in the suite.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { expect, vi } from 'vitest';

import enCommon from '@/messages/en/common.json';
import enFreeStart from '@/messages/en/freeStart.json';
import enHero from '@/messages/en/hero.json';
import { enFreeStartMessages } from '@/messages/free-start-test-messages';
import { createRoutingLinkMock } from '@/test/free-start-organizer-harness';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { resetPublicIntakeBrowser } from '@/test/public-intake-fixture';
// prettier-ignore
import { parseSecureSaveCopy, parseSecureSaveReviewCopy, type SavedDraft } from '@/app/[locale]/components/home/free-start-intake-shell/types';

export type SessionUser = { id: string; role: string; tenantId: string };
export type SessionSnapshot = { data: { user: SessionUser } | null; isPending: boolean };
export type SessionStore = {
  read: () => SessionSnapshot;
  set: (next: SessionSnapshot) => void;
  subscribe: (listener: () => void) => () => void;
};
// prettier-ignore
type BoundaryAction = 'account' | 'create' | 'list' | 'pack' | 'remove' | 'replace' | 'resume' | 'send' | 'signIn' | 'submit' | 'update';
export type ContinuityBoundary = SessionStore & Record<BoundaryAction, ReturnType<typeof vi.fn>>;

const seams = vi.hoisted(() => {
  type User = { id: string; role: string; tenantId: string };
  type Snapshot = { data: { user: User } | null; isPending: boolean };
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { data: null, isPending: true };
  // prettier-ignore
  const actions = { account: vi.fn(), create: vi.fn(), list: vi.fn(), pack: vi.fn(), remove: vi.fn(), replace: vi.fn(), resume: vi.fn(), send: vi.fn(), signIn: vi.fn(), submit: vi.fn(), update: vi.fn() };
  // prettier-ignore
  const publish = (next: Snapshot) => { snapshot = next; for (const listener of listeners) listener(); };
  // prettier-ignore
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
  return { ...actions, read: () => snapshot, set: publish, subscribe };
});

/** The private boundary above is reached only here; it is never exported as a live binding. */
export function continuityBoundary(): ContinuityBoundary {
  return seams;
}

export function createCalls() {
  return seams.create.mock.calls.map(call => call[0]);
}

/** Subscribes the way the real session store does, so publication re-renders the real tree. */
export function useSessionSnapshot(store: SessionStore): SessionSnapshot {
  return useSyncExternalStore(store.subscribe, store.read, store.read);
}

let homeMessageCatalog: Record<string, unknown> | null = null;
let homeTranslator: ReturnType<typeof createUseTranslationsMock> | null = null;

function homeMessages(): Record<string, unknown> {
  homeMessageCatalog ??= { ...enCommon, ...enHero, freeStart: enFreeStartMessages.freeStart };
  return homeMessageCatalog;
}

/** The real EN catalogs the mounted hero, skeleton and organizer read, and nothing else. */
function homeTranslations() {
  homeTranslator ??= createUseTranslationsMock(homeMessages);
  return homeTranslator;
}

// Only framework, translation, auth-session and server-action seams are replaced. The hero, the
// landing tracker, the organizer, its draft lifecycle, the secure save band and the neutral OTP
// hook all run for real against the real EN catalogs.
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: seams.send },
    signIn: { emailOtp: seams.signIn },
    useSession: () => useSessionSnapshot(seams),
  },
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: seams.account,
  createFreeStartDraft: seams.create,
  deleteFreeStartDraft: seams.remove,
  listFreeStartDrafts: seams.list,
  resumeFreeStartDraft: seams.resume,
  updateFreeStartDraft: seams.update,
}));
// prettier-ignore
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: (name?: string) => homeTranslations()(name) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: seams.replace }) }));
// prettier-ignore
vi.mock('@/i18n/routing', () => ({ ...createRoutingLinkMock(), getPathname: ({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`, routing: { defaultLocale: 'sq', locales: ['sq', 'en', 'mk', 'sr'] } }));
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: seams.submit }));
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: seams.pack }));

export const freeStartCopy = enFreeStart.freeStart;
export const heroCopy = enHero.hero.publicEntry;
export const saveEntryCopy = freeStartCopy.saveEntry;
export const secureSaveCopy = parseSecureSaveCopy(freeStartCopy.secureSave);
export const secureSaveReviewCopy = parseSecureSaveReviewCopy(freeStartCopy.secureSaveReviewCopy);

export const ANONYMOUS_PENDING: SessionSnapshot = { data: null, isPending: true };
export const ANONYMOUS_SETTLED: SessionSnapshot = { data: null, isPending: false };
export const OWNER_A: SessionUser = { id: 'user_owner_a', role: 'member', tenantId: 'tenant_ks' };
export const OWNER_B: SessionUser = { id: 'user_owner_b', role: 'member', tenantId: 'tenant_ks' };

/** A settled session the provider has already published for one owner. */
export function settledOwner(user: SessionUser): SessionSnapshot {
  return { data: { user }, isPending: false };
}

/** An ordinary session refresh for an owner who is still signed in; this is not a logout. */
export function pendingRefresh(user: SessionUser): SessionSnapshot {
  return { data: { user }, isPending: true };
}

export async function publishSession(store: SessionStore, next: SessionSnapshot): Promise<void> {
  await act(() => {
    store.set(next);
    return Promise.resolve();
  });
}

export const VEHICLE_FACTS = {
  counterparty: 'Northern Adriatic Insurance',
  desiredOutcome: 'repair',
  incidentDate: '2026-09-28',
  issueType: 'collision',
  summary: 'A delivery van reversed into my parked car and broke the rear door.',
} as const;

export const SAVED_DRAFT_ID = 'c0ffee11-2222-4333-8444-555566667777';
export const VERIFIED_EMAIL = 'owner.a@example.com';

/** The acknowledgment the real create action returns for exactly these reviewed facts. */
export function savedVehicleDraft(overrides: Partial<SavedDraft> = {}): SavedDraft {
  return {
    ...VEHICLE_FACTS,
    category: 'vehicle',
    clientRequestId: 'server-echoed-request',
    createdAt: '2026-09-28T09:15:00.000Z',
    id: SAVED_DRAFT_ID,
    resumeStep: 'preview',
    updatedAt: '2026-09-28T09:16:00.000Z',
    version: 1,
    ...overrides,
  };
}

export const AUTH_REQUIRED = { ok: false, code: 'authRequired' };
export const ACCOUNT_CONTEXT = { ok: false, code: 'unavailableAccountContext' };
export const ACKNOWLEDGED = { ok: true, draft: savedVehicleDraft(), idempotent: false };
export const CONTINUATION_HREF = `/en/member/claims/new?mode=drafts#draft=${SAVED_DRAFT_ID}`;
export const SIGN_IN_OK = { data: { user: { id: OWNER_A.id } }, error: null };

/** Returns every seam to its anonymous pending starting point with no scripted outcome. */
export function resetContinuityBoundary(): void {
  vi.resetAllMocks();
  resetPublicIntakeBrowser();
  seams.set(ANONYMOUS_PENDING);
  seams.account.mockImplementation(async () => {
    let owner = seams.read().data?.user;
    if (!owner && seams.signIn.mock.calls.length) {
      const answer = await seams.signIn.mock.results.at(-1)?.value;
      if (answer?.data?.user?.id === OWNER_A.id) owner = OWNER_A;
    }
    return owner
      ? {
          ok: true,
          emailVerified: true,
          expectedContext: { ownerUserId: owner.id, tenantId: owner.tenantId },
        }
      : AUTH_REQUIRED;
  });
  seams.create.mockResolvedValue(AUTH_REQUIRED);
  seams.list.mockImplementation(input =>
    Promise.resolve({
      ok: true,
      items: [],
      nextCursor: null,
      expectedContext: input.expectedContext,
    })
  );
  seams.send.mockResolvedValue({ data: {}, error: null });
  seams.signIn.mockResolvedValue(SIGN_IN_OK);
}

export type Held<T> = { promise: Promise<T>; resolve: (value: T) => void };

export function deferred<T>(): Held<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Releases a held boundary answer and lets the organizer finish reacting to it. */
export async function settleHeld<T>(held: Held<T>, answer: T): Promise<void> {
  await act(async () => {
    held.resolve(answer);
    await held.promise;
  });
}

const DETAIL_FIELDS = ['issueType', 'incidentDate', 'counterparty', 'desiredOutcome', 'summary'];

/** Chooses the vehicle situation, types the real report and reviews it before any save. */
export async function prepareVehicleReport(): Promise<void> {
  fireEvent.click(await screen.findByTestId('free-start-category-vehicle'));
  await screen.findByLabelText(freeStartCopy.details.summary);
  await waitFor(() =>
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
  );
  for (const field of DETAIL_FIELDS) {
    const label = freeStartCopy.details[field as keyof typeof freeStartCopy.details];
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: VEHICLE_FACTS[field as keyof typeof VEHICLE_FACTS] },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: freeStartCopy.details.continue }));
  await screen.findByText(VEHICLE_FACTS.summary);
}

/** Reveals the optional save area; presentation only, so no consent or request may follow. */
export async function openSaveArea(): Promise<void> {
  const opener =
    screen.queryByTestId('free-start-save-entry-open') ??
    screen.queryByTestId('free-start-save-entry-manage');
  if (opener) fireEvent.click(opener);
  await screen.findByTestId('free-start-secure-save-band');
}

/**
 * Opts into device recovery the way a customer must: reveal the save area, expand the optional
 * device details, then take the explicit enable that is the first thing permitted to write.
 */
export async function enableDeviceRecovery(): Promise<void> {
  await openSaveArea();
  fireEvent.click(await screen.findByTestId('browser-recovery-details-open'));
  expect(localStorage).toHaveLength(0);
  fireEvent.click(await screen.findByTestId('browser-recovery-enable'));
  expect(screen.queryByTestId('browser-recovery-disclosure')).toBeNull();
}

export async function openSecureSave(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByTestId('free-start-save-open'));
  return screen.findByTestId('free-start-save-otp');
}

export async function requestCode(email = VERIFIED_EMAIL): Promise<void> {
  fireEvent.change(screen.getByTestId('free-start-save-email'), { target: { value: email } });
  fireEvent.click(screen.getByTestId('free-start-save-send-code'));
  await screen.findByTestId('free-start-save-code');
}

/** Submits the delivered code and lets the verified intent reach the server action. */
export async function submitCode(code = '123456'): Promise<void> {
  fireEvent.change(screen.getByTestId('free-start-save-code'), { target: { value: code } });
  await act(() => {
    fireEvent.click(screen.getByTestId('free-start-save-verify'));
    return Promise.resolve();
  });
}

/** The real journey: review the facts, open the secure save, then verify the owner email. */
export async function saveWithVerifiedEmail(): Promise<void> {
  await prepareVehicleReport();
  await openSecureSave();
  await requestCode();
  await submitCode();
}

export const organizerNode = () => screen.getByTestId('premium-free-start-organizer');
export const saveStatus = () => screen.getByTestId('free-start-save-status');
export const continuation = () => screen.queryByTestId('saved-draft-continue');
export const reportedFacts = () => screen.queryByText(VEHICLE_FACTS.summary);

export async function expectSaveState(state: string): Promise<void> {
  await waitFor(() => expect(saveStatus()).toHaveAttribute('data-state', state));
}

/**
 * A reset save area holds no receipt, so it collapses back to the optional entry with the
 * conservative status. This replaces an idle expanded band: no receipt, no continuation, no
 * clutter, and no claim about what device storage does or does not hold.
 */
export async function expectNoSavedReceipt(): Promise<void> {
  await waitFor(() => expect(continuation()).toBeNull());
  expect(screen.queryByTestId('account-draft-status')?.dataset.state).not.toBe('saved');
  expect(screen.queryByTestId('saved-draft-continuation')).toBeNull();
}
