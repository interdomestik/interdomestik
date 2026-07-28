const TRANSIENT_NAVIGATION_ERROR_PATTERNS = [
  /ERR_CONNECTION_REFUSED/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /Timeout \d+ms exceeded/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /is interrupted by another navigation to/i,
];

function compactNavigationError(raw) {
  return String(raw || '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function isTransientNavigationError(raw) {
  const message = compactNavigationError(raw);
  if (!message) return false;
  return TRANSIENT_NAVIGATION_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gotoWithTransientRetry({
  navigate,
  maxAttempts = 4,
  delayMs = 1_000,
  sleepFn = wait,
}) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await navigate();
    } catch (error) {
      if (!isTransientNavigationError(error?.message || error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleepFn(delayMs * attempt);
    }
  }
}

module.exports = {
  gotoWithTransientRetry,
  isTransientNavigationError,
};
