export function authorizeCronRequest(args: {
  authorizationHeader: string | null;
  cronSecret: string | undefined;
  nodeEnv: string | undefined;
  allowDevBypass: boolean;
}): boolean {
  const { authorizationHeader, cronSecret, nodeEnv, allowDevBypass } = args;

  const isDevelopment = (nodeEnv || 'production') !== 'production';
  if (isDevelopment && allowDevBypass) return true;

  if (!cronSecret) return false;
  return authorizationHeader === `Bearer ${cronSecret}`;
}
