import { vi } from 'vitest';

// Shared browser capabilities for the real Radix committed-outcome tests.
export function installOpsBrowserGlobals(reload: () => void) {
  vi.stubGlobal('location', { href: 'http://localhost/', reload: reload });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
}
