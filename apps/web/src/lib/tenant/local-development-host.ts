function normalizeHost(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  return raw.replace(/:\d+$/, '').toLowerCase().replace(/\.$/, '');
}

export function isLocalDevelopmentHost(host: string): boolean {
  const normalized = normalizeHost(host);
  const localHosts = ['localhost', '127.0.0.1', '127.0.0.1.nip.io'];
  return (
    localHosts.includes(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.127.0.0.1.nip.io')
  );
}
