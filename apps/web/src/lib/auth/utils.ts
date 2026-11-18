import {
  filterHostedOrigins,
  hostedAuthHosts,
  hostedAuthOrigin,
  isHostedDeployment,
} from './deployment-hosts';

// Only trailing slashes are tolerated after an origin; a path, query or credential stays off-list.
function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

export function getTrustedOrigins(): string[] | undefined {
  const raw = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  const localProtocol = 'http';
  let origins = raw
    ? raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];

  // A hosted deployment trusts its own environment's exact hosts and nothing else (SEC-11).
  // Better Auth also appends BETTER_AUTH_TRUSTED_ORIGINS on its own, so an off-list entry cannot be
  // filtered out here: the deployment refuses to configure auth until the variable is corrected.
  if (isHostedDeployment()) {
    const own = hostedAuthHosts().map(host => `https://${host}`);
    const allowed = filterHostedOrigins(origins);
    const offList = origins.filter(origin => !allowed.includes(withoutTrailingSlashes(origin)));
    if (offList.length > 0) {
      // Content-free: the rejected values may carry credentials or tokens and reach the logs.
      throw new Error(
        `BETTER_AUTH_TRUSTED_ORIGINS names ${offList.length} origin(s) this deployment does not trust`
      );
    }
    return Array.from(new Set([...own, ...allowed]));
  }

  // DX: Automatically trust nip.io subdomains in development or automated tests to fix multi-tenant login
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.INTERDOMESTIK_AUTOMATED === '1' ||
    process.env.PLAYWRIGHT === '1'
  ) {
    const devHosts = [
      'ida.127.0.0.1.nip.io:3000',
      'ks.127.0.0.1.nip.io:3000',
      'mk.127.0.0.1.nip.io:3000',
      'pilot.127.0.0.1.nip.io:3000',
      'app.127.0.0.1.nip.io:3000',
      '127.0.0.1.nip.io:3000',
      '127.0.0.1:3000',
      'localhost:3000',
    ];
    const devOrigins = devHosts.map(host => `${localProtocol}://${host}`);
    // Deduplicate
    origins = Array.from(new Set([...origins, ...devOrigins]));
  }

  if (origins.length === 0) return undefined;
  return origins;
}

type DynamicAuthBaseURL = {
  allowedHosts: string[];
  fallback: string;
  protocol: 'https';
};

type AuthBaseURL = string | DynamicAuthBaseURL;

export function getAuthBaseURL(): AuthBaseURL {
  if (isHostedDeployment()) {
    return {
      allowedHosts: [...hostedAuthHosts()],
      fallback: hostedAuthOrigin(),
      protocol: 'https' as const,
    };
  }

  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://ida.interdomestik.com'
  );
}
