import { vi } from 'vitest';
import { takePendingPublicEntryIntent } from '@/app/[locale]/components/home/public-entry-intent';

type Action = (...args: unknown[]) => unknown;

export function createDraftWriterMock(writer: Action) {
  return {
    createFreeStartDraft: writer,
    deleteFreeStartDraft: writer,
    listFreeStartDrafts: writer,
    resumeFreeStartDraft: writer,
    updateFreeStartDraft: writer,
  };
}

export function createIdentityMock(identity: Action) {
  return {
    authClient: {
      emailOtp: { sendVerificationOtp: identity },
      signIn: { emailOtp: identity },
    },
  };
}

/** Immediate reads are the baseline; held-read suites retain their own lock scheduler. */
export function resetPublicIntakeBrowser() {
  localStorage.clear();
  takePendingPublicEntryIntent();
  history.replaceState(null, '', '/');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: vi.fn((_name, _options, callback) => Promise.resolve(callback())) },
  });
}
