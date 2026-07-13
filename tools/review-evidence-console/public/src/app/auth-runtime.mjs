const EXPLICIT_LOGIN_FAILURES = new Set(['forbidden', 'rate_limited', 'unavailable']);
const EXPLICIT_SESSION_FAILURES = new Set(['forbidden', 'unavailable']);

export function createAuthRuntime({
  client,
  onState,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let current = { status: 'checking' };
  let expiryTimer;
  const scheduleExpiry = account => {
    if (expiryTimer) clearTimer(expiryTimer);
    if (!Number.isSafeInteger(account?.sessionExpiresAt)) return;
    const delay = Math.max(0, account.sessionExpiresAt * 1000 - now());
    expiryTimer = setTimer(() => emit({ status: 'anonymous', reason: 'session_expired' }), delay);
  };
  const emit = value => {
    if (value.status !== 'authenticated' && expiryTimer) clearTimer(expiryTimer);
    current = value;
    onState(value);
    if (value.status === 'authenticated') scheduleExpiry(value.account);
  };
  async function start() {
    emit({ status: 'checking' });
    try {
      emit({ status: 'authenticated', account: await client.session() });
    } catch (error) {
      emit({
        status: 'anonymous',
        reason: EXPLICIT_SESSION_FAILURES.has(error?.code) ? error.code : 'session_expired',
      });
    }
  }
  async function login(credentials) {
    emit({ status: 'authenticating' });
    try {
      emit({ status: 'authenticated', account: await client.login(credentials) });
    } catch (error) {
      emit({
        status: 'anonymous',
        reason: EXPLICIT_LOGIN_FAILURES.has(error?.code) ? error.code : 'authentication_failed',
        username: credentials.username,
      });
    }
  }
  async function logout() {
    try {
      await client.logout();
    } finally {
      emit({ status: 'anonymous', reason: 'logout' });
    }
  }
  return Object.freeze({
    start,
    login,
    logout,
    expire: () => emit({ status: 'anonymous', reason: 'session_expired' }),
    state: () => current,
  });
}
