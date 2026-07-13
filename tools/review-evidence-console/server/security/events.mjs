const CODES = new Set([
  'configuration_failed',
  'login_failed',
  'rate_limited',
  'receipt_failed',
  'role_boundary_denied',
  'session_failed',
]);

export function createSecurityEvents(write = () => {}) {
  return Object.freeze({
    emit(event) {
      if (!CODES.has(event)) throw new TypeError('Invalid security event.');
      write(Object.freeze({ event, count: 1 }));
    },
  });
}

export const silentSecurityEvents = createSecurityEvents();
