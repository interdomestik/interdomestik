function normalizeHost(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  return raw.replace(/:\d+$/, '').toLowerCase().replace(/\.$/, '');
}

const LOCAL_NIP_IO_LABELS = new Set(['mk', 'ks', 'al', 'pilot']);

function isDecimalOctet(value: string): boolean {
  if (value.length === 0 || value.length > 3) return false;
  let parsed = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.codePointAt(index) ?? -1;
    if (code < 48 || code > 57) return false;
    parsed = parsed * 10 + (code - 48);
  }
  return parsed <= 255;
}

function isSupportedLocalNipIoAlias(host: string): boolean {
  const parts = host.split('.');
  return (
    parts.length === 7 &&
    LOCAL_NIP_IO_LABELS.has(parts[0] ?? '') &&
    isDecimalOctet(parts[1] ?? '') &&
    isDecimalOctet(parts[2] ?? '') &&
    isDecimalOctet(parts[3] ?? '') &&
    isDecimalOctet(parts[4] ?? '') &&
    parts[5] === 'nip' &&
    parts[6] === 'io'
  );
}

export function isLocalDevelopmentHost(host: string): boolean {
  const normalized = normalizeHost(host);
  const localHosts = ['localhost', '127.0.0.1', '127.0.0.1.nip.io'];
  return (
    localHosts.includes(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.127.0.0.1.nip.io') ||
    isSupportedLocalNipIoAlias(normalized)
  );
}
