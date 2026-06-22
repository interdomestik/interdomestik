const net = require('node:net');

function normalizeHostname(hostname) {
  return String(hostname || '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
}

function isPrivateIpv4(hostname) {
  if (net.isIP(hostname) !== 4) return false;
  const octets = hostname.split('.').map(Number);
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 0
  );
}

function isLoopbackOrPrivateHost(hostname) {
  const normalized = normalizeHostname(hostname);
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (net.isIP(normalized) === 6) return true;
  return isPrivateIpv4(normalized);
}

function matchesAllowedHost(url, options) {
  const host = normalizeHostname(url.hostname);
  const exact = options.allowedHostnames || [];
  const suffixes = options.allowedHostnameSuffixes || [];
  return (
    exact.length + suffixes.length === 0 ||
    exact.some(candidate => host === normalizeHostname(candidate)) ||
    suffixes.some(suffix => host.endsWith(normalizeHostname(suffix)))
  );
}

function assertSafeHttpUrl(rawValue, options = {}) {
  const parsed = new URL(String(rawValue || ''));
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsafe egress URL protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Unsafe egress URL must not include credentials');
  }
  if (!options.allowLoopback && isLoopbackOrPrivateHost(parsed.hostname)) {
    throw new Error(`Unsafe egress URL host: ${parsed.hostname}`);
  }
  if (!matchesAllowedHost(parsed, options)) {
    throw new Error(`Egress URL host is not allowed: ${parsed.hostname}`);
  }
  return parsed;
}

function assertTrustedVercelDeploymentUrl(rawValue, options = {}) {
  return assertSafeHttpUrl(rawValue, {
    ...options,
    allowedHostnameSuffixes: ['.vercel.app'],
  });
}

module.exports = {
  assertSafeHttpUrl,
  assertTrustedVercelDeploymentUrl,
  isLoopbackOrPrivateHost,
};
