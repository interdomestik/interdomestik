import { vi } from 'vitest';

// Shared browser capabilities for the real Radix committed-outcome tests.
export function installOpsBrowserGlobals(reload: () => void) {
  vi.stubGlobal('location', { href: 'http://localhost/', reload: reload });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        // Layout observation is intentionally inert in these jsdom interaction tests.
      }
      unobserve() {
        // No observation is registered by this test-only stub.
      }
      disconnect() {
        // No observer resources are allocated by this test-only stub.
      }
    }
  );
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
}
