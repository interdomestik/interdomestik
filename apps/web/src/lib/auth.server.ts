import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from './auth';

/**
 * Vercel Best Practice: Server-Side Performance (server-cache-react)
 * Use React.cache() to deduplicate auth session fetching across the component tree.
 */
export const getCachedSession = cache(async () => {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch (error) {
    console.error('[AuthServer] Error fetching session:', error);
    return null;
  }
});
