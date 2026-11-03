import { admitCronRequest, type IngressCapability } from '@interdomestik/database/ingress';

/**
 * Admits a cron request by its `Authorization: Bearer <CRON_SECRET>` header. The returned
 * capability is the only way a cron job reaches the scheduled-work tenant producer; the secret is
 * read and compared (in constant time) inside the database package, never passed by a caller.
 */
export function authorizeCronRequest(args: {
  authorizationHeader: string | null;
}): IngressCapability<'cron'> | null {
  // 🔒 SECURITY: Never bypass authentication, even in development
  // Development should use proper authentication to prevent security holes

  if (!process.env.CRON_SECRET?.trim()) {
    console.error('CRON_SECRET is not configured');
    return null;
  }

  const ingress = admitCronRequest(args.authorizationHeader);
  if (!ingress) {
    console.warn('Unauthorized cron request attempt detected');
    return null;
  }

  return ingress;
}
