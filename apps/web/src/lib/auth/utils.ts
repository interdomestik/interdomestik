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
