export function authorizeCronRequest(args: {
  authorizationHeader: string | null;
  cronSecret: string | undefined;
}): boolean {
  const { authorizationHeader, cronSecret } = args;

  // 🔒 SECURITY: Never bypass authentication, even in development
  // Development should use proper authentication to prevent security holes

  if (!cronSecret) {
    console.error('CRON_SECRET is not configured');
    return false;
  }

  const expectedAuth = `Bearer ${cronSecret}`;
  const isValidAuth = authorizationHeader === expectedAuth;

  if (!isValidAuth) {
    console.warn('Unauthorized cron request attempt detected');
    return false;
  }

  return true;
}
