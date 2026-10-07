import { act, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes } from 'react';
import { type Mock, vi } from 'vitest';
import enClaims from '@/messages/en/claims.json';
import enFree from '@/messages/en/freeStart.json';
import { EMPTY_DRAFT } from '../constants';
import type { DraftAccount } from '../draft-lifecycle-editor';
import type { FreeStartIntakeShell } from '../index';
import type { DraftActionMocks } from './account-draft-hook-fixtures';

type BandProps = Readonly<{ recovery: Readonly<{ offer: unknown; resume: () => void }> }>;
/** Suite-owned action mocks; the shared setup never creates or retains a mock singleton. */
export type ShellActionMocks = DraftActionMocks & Readonly<{ submit: Mock; lookup: Mock }>;

// Module doubles for `@/i18n/routing`, `@/lib/auth-client` and the presentation-only band: the
// suites hand this module to vi.mock, so each export keeps the mocked module's real name.
export function Link({ children, href }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href}>{children}</a>;
}
export function AnonymousDraftRecoveryBand({ recovery }: BandProps) {
  return recovery.offer ? (
    <button type="button" onClick={() => recovery.resume()}>
      Use browser notes
    </button>
  ) : null;
}
export const authClient = {
  useSession: () => ({
    data: { user: { id: 'owner-a', tenantId: 'tenant_ks' } },
    isPending: false,
  }),
};

export const context = { ownerUserId: 'owner-a', tenantId: 'tenant_ks' };
export const account: DraftAccount = { emailVerified: true, expectedContext: context };
export const RESUME = 'Use browser notes';
export const browserCopy = {
  category: 'property' as const,
  draft: { ...EMPTY_DRAFT, summary: 'Water damaged the garage.' },
  resumeStep: 'details' as const,
};
export const saved = {
  ...browserCopy.draft,
  category: 'property' as const,
  resumeStep: 'details' as const,
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  id: '22222222-2222-4222-8222-222222222222',
  version: 1,
  createdAt: '2026-10-07T09:00:00Z',
  updatedAt: '2026-10-07T09:00:00Z',
};
export const summaryLabel = enFree.freeStart.details.summary;
export const pause = (ms: number) =>
  act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));
/** The lock manager double installed by `resetShell`; its results are the guarded callbacks. */
export const lockRequests = (): Mock => (navigator.locks as unknown as { request: Mock }).request;

const MICROTASK_YIELDS = 25;
/** One sequential `.then` hop per microtask; Promise.all would collapse them into one drain. */
export function drainMicrotasks(): Promise<void> {
  // 24 chained hops plus the caller's await are exactly 25 sequential microtask yields.
  return Array.from({ length: MICROTASK_YIELDS - 1 }).reduce<Promise<void>>(
    chain => chain.then(() => undefined),
    Promise.resolve()
  );
}

// Preserve immediate evaluation and rejection when the receipt getter throws.
function acknowledgeUpdate(input: { expectedVersion: number }) {
  let draft: Record<string, unknown>;
  try {
    draft = { ...saved, ...input, version: input.expectedVersion + 1 };
  } catch (error) {
    return Promise.reject(error);
  }
  return Promise.resolve({ ok: true, draft });
}

/** Fresh native storage, lock manager and successful defaults for only the supplied actions. */
export function resetShell(actions: ShellActionMocks): void {
  vi.resetAllMocks();
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn((_name: string, _options: unknown, callback: () => unknown) =>
        Promise.resolve(callback())
      ),
    },
  });
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue({
    ok: true,
    items: [],
    nextCursor: null,
    expectedContext: context,
  });
  actions.lookup.mockResolvedValue({ claim: null });
  actions.create.mockResolvedValue({ ok: true, draft: saved });
  actions.update.mockImplementation(acknowledgeUpdate);
}

export function renderShellWith(Shell: typeof FreeStartIntakeShell) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ ...enFree, ...enClaims, common: { errors: { retry: 'Retry' } }, diaspora: {} }}
      timeZone="UTC"
    >
      <Shell
        initialCategory="vehicle"
        locale="en"
        continueHref="/pricing"
        neutralOtpHost={location.host}
        draftAccount={account}
      />
    </NextIntlClientProvider>
  );
}
