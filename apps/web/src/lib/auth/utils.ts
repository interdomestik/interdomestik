export function getTrustedOrigins(): string[] | undefined {
  const raw = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  const localProtocol = 'http';
  let origins = raw
    ? raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];

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

const DYNAMIC_AUTH_ALLOWED_HOSTS = [
  'interdomestik.com',
  'www.interdomestik.com',
  'app.interdomestik.com',
  'ida.interdomestik.com',
  'staging.interdomestik.com',
  'ks.interdomestik.com',
  'mk.interdomestik.com',
  'interdomestik-web.vercel.app',
  'interdomestik-*-ecohub.vercel.app',
];

type DynamicAuthBaseURL = {
  allowedHosts: string[];
  fallback: string;
  protocol: 'https';
};

type AuthBaseURL = string | DynamicAuthBaseURL;

export function getAuthBaseURL(): AuthBaseURL {
  if (process.env.VERCEL === '1' || process.env.VERCEL_URL) {
    return {
      allowedHosts: DYNAMIC_AUTH_ALLOWED_HOSTS,
      fallback:
        process.env.BETTER_AUTH_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'https://www.interdomestik.com',
      protocol: 'https' as const,
    };
  }

  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://www.interdomestik.com'
  );
}
