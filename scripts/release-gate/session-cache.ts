function hasUsableSessionState(storageState) {
  if (!storageState || typeof storageState !== 'object') return false;
  // loginAs restores cached sessions through BrowserContext cookies.
  // Empty cookie jars are unauthenticated and must not skip a real login.
  return Array.isArray(storageState.cookies) && storageState.cookies.length > 0;
}

async function restoreCachedSession({ page, authState, accountCacheKey, forceFresh }) {
  if (forceFresh) return false;
  const cachedSessionState = authState.sessionStateByAccount.get(accountCacheKey);
  if (!hasUsableSessionState(cachedSessionState)) return false;

  await page.context().clearCookies();
  await page.context().addCookies(cachedSessionState.cookies);
  return true;
}

function storeUsableSessionState(authState, accountCacheKey, storageState) {
  if (hasUsableSessionState(storageState)) {
    authState.sessionStateByAccount.set(accountCacheKey, storageState);
    return;
  }
  authState.sessionStateByAccount.delete(accountCacheKey);
}

module.exports = {
  hasUsableSessionState,
  restoreCachedSession,
  storeUsableSessionState,
};
