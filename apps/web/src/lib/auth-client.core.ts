import { createAuthClient } from 'better-auth/react';

/**
 * DYNAMIC AUTH CLIENT
 * In development, we don't hardcode baseURL so it uses relative paths.
 * This allows the same client to work on:
 * - ks.127.0.0.1.nip.io:3000
 * - mk.127.0.0.1.nip.io:3000
 * - localhost:3000
 */
export const authClient = createAuthClient({
  // In the browser, omitting baseURL makes it relative,
  // which is perfect for multi-tenant subdomains.
  baseURL: typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL,
});
