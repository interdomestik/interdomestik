import { betterAuth } from 'better-auth';
import { buildAuthProviders } from '@/lib/auth/providers';

export const authOperationPrefix = 'app/api/auth/[...all]/route.ts#';

export function discoverAuthOperations() {
  const auth = betterAuth({
    ...buildAuthProviders({}),
    baseURL: 'https://example.test',
    secret: 'synthetic-test-secret-for-endpoint-metadata-only',
  });
  // Inspect the mounted endpoint metadata without invoking a handler or using an adapter.
  return Object.values(auth.api).flatMap(endpoint => {
    if (!endpoint.path) return [];
    const methods = endpoint.options.method;
    if (!methods) throw new Error(`Better Auth operation lacks an HTTP method: ${endpoint.path}`);
    return [methods].flat().map(method => `${authOperationPrefix}${method} ${endpoint.path}`);
  });
}
