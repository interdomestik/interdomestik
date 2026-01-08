/**
 * Test Setup File
 *
 * This file is automatically loaded before each test file.
 * It sets up global mocks, testing utilities, and test environment.
 */

import '@testing-library/jest-dom';
import { afterEach, beforeAll, vi } from 'vitest';

// Set critical env vars at module load time.
// Some app modules (e.g. Supabase client) are initialized during import, which happens
// before `beforeAll()` hooks run.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/en/member',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ locale: 'en' }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: () => new Headers(),
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn(fn => fn),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  useMessages: () => ({}),
  getTranslations: vi.fn(() => (key: string) => key),
  getLocale: vi.fn(() => 'en'),
}));

// Mock ResizeObserver (needed for many UI components)
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

// Mock IntersectionObserver
class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL SETUP
// ═══════════════════════════════════════════════════════════════════════════════

beforeAll(() => {
  // Setup browser APIs
  globalThis.ResizeObserver = ResizeObserverMock;
  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;

  // Mock window.matchMedia
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock window.localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value.toString();
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] || null),
      get length() {
        return Object.keys(store).length;
      },
    };
  })();
  vi.stubGlobal('localStorage', localStorageMock);

  // Mock fetch
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    )
  );

  // Mock scrollTo
  vi.stubGlobal('scrollTo', vi.fn());

  // Suppress console.error for expected errors in tests
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    // Filter out known React/testing-library warnings
    const message = args[0];
    if (typeof message === 'string') {
      if (message.includes('Warning: ReactDOM.render')) return;
      if (message.includes('act(...)')) return;
    }
    originalError.apply(console, args);
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM MATCHERS & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

// Extend expect with custom matchers if needed
// expect.extend({
//   toBeValidClaim(received) {
//     // Custom matcher implementation
//   },
// });
