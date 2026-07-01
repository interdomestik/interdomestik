function normalizeAppHost(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  const withoutProtocol = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '');
  const withoutPath = withoutProtocol.split('/')[0] ?? '';
  const bracketedIpv6 = /^\[([^\]]+)\](?::\d+)?$/u.exec(withoutPath);
  const withoutPort = bracketedIpv6?.[1] ?? withoutPath.replace(/:\d+$/u, '');
  return withoutPort.toLowerCase().replace(/\.$/u, '');
}

function parseIpv4(host: string): readonly [number, number, number, number] | null {
  const octets = host.split('.');
  if (octets.length !== 4) return null;

  const parsed = octets.map(octet => {
    if (!/^(?:0|[1-9]\d{0,2})$/u.test(octet)) return null;
    const value = Number(octet);
    return value >= 0 && value <= 255 ? value : null;
  });
  if (parsed.includes(null)) return null;

  return parsed as [number, number, number, number];
}

function isPrivateOrLoopbackIpv4(octets: readonly [number, number, number, number]): boolean {
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function isLocalTenantAppHost(host: string): boolean {
  const normalized = normalizeAppHost(host);
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized === '::1') {
    return true;
  }

  const directIp = parseIpv4(normalized);
  if (directIp) return isPrivateOrLoopbackIpv4(directIp);

  const nipIoMatch = /^(?:[a-z0-9-]+\.)*((?:\d{1,3}\.){3}\d{1,3})\.nip\.io$/u.exec(normalized);
  if (!nipIoMatch?.[1]) return false;

  const embeddedIp = parseIpv4(nipIoMatch[1]);
  return embeddedIp ? isPrivateOrLoopbackIpv4(embeddedIp) : false;
}
