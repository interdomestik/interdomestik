export function getTrustedOrigins(): string[] | undefined {
  const raw = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  let origins = raw
    ? raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];

  // DX: Automatically trust nip.io subdomains in development to fix multi-tenant login
  if (process.env.NODE_ENV === 'development') {
    const devOrigins = [
      'http://ks.127.0.0.1.nip.io:3000',
      'http://mk.127.0.0.1.nip.io:3000',
      'http://app.127.0.0.1.nip.io:3000',
      'http://127.0.0.1.nip.io:3000',
      'http://127.0.0.1:3000', // Bare IP support
      'http://localhost:3000',
    ];
    // Deduplicate
    origins = Array.from(new Set([...origins, ...devOrigins]));
  }

  if (origins.length === 0) return undefined;
  return origins;
}
