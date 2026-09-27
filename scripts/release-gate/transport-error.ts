const TRANSIENT_TRANSPORT_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const DNS_CODES = new Set(['EAI_AGAIN', 'ENODATA', 'ENOTFOUND']);
const TCP_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);
const TLS_CODE_PATTERN = /^(?:CERT_|DEPTH_ZERO_|ERR_SSL_|ERR_TLS_|SELF_SIGNED_|UNABLE_TO_)/u;
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/u;
const KNOWN_CODE_PATTERN = new RegExp(
  `\\b(${[
    ...TRANSIENT_TRANSPORT_CODES,
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  ].join('|')})\\b`,
  'u'
);

function compactSanitizedMessage(raw, maxLength = 180) {
  return String(raw || '')
    .replaceAll(/https?:\/\/[^\s"')]+/giu, '[url]')
    .replaceAll(
      /\b(token|secret|password|authorization|cookie|api[_-]?key)=([^\s&]+)/giu,
      '$1=[redacted]'
    )
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}

function errorNodes(root) {
  const nodes = [];
  const queue = [root];
  const seen = new Set();
  while (queue.length && nodes.length < 8) {
    const value = queue.shift();
    if (!value || (typeof value !== 'object' && typeof value !== 'string')) continue;
    if (typeof value === 'object') {
      if (seen.has(value)) continue;
      seen.add(value);
    }
    nodes.push(value);
    if (typeof value !== 'object') continue;
    if (value.cause) queue.push(value.cause);
    if (Array.isArray(value.errors)) queue.push(...value.errors);
  }
  return nodes;
}

function normalizedCode(node) {
  const propertyCode = typeof node === 'object' ? String(node.code || '').toUpperCase() : '';
  if (SAFE_CODE_PATTERN.test(propertyCode)) return propertyCode;
  const message = String(typeof node === 'object' ? node.message || '' : node);
  return message.toUpperCase().match(KNOWN_CODE_PATTERN)?.[1] || '';
}

function transportPhase(node, code) {
  const syscall = typeof node === 'object' ? String(node.syscall || '').toLowerCase() : '';
  if (DNS_CODES.has(code) || syscall.includes('getaddrinfo')) return 'dns';
  if (TLS_CODE_PATTERN.test(code) || syscall.includes('tls')) return 'tls';
  if (TCP_CODES.has(code) || syscall === 'connect') return 'tcp';
  return '';
}

function hostCategory(rawHostname) {
  const hostname = String(rawHostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, '');
  if (!hostname) return 'unknown';
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return 'loopback';
  }
  if (hostname === 'interdomestik.com' || hostname.endsWith('.interdomestik.com')) {
    return 'canonical';
  }
  if (hostname === 'vercel.app' || hostname.endsWith('.vercel.app')) return 'deployment';
  return 'external';
}

function describeTransportError(error, options = {}) {
  for (const node of errorNodes(error)) {
    const code = normalizedCode(node);
    if (!code) continue;
    const phase = transportPhase(node, code);
    if (!phase) continue;
    const hostname =
      typeof node === 'object' ? node.hostname || node.host || options.hostname : options.hostname;
    const retryable = TRANSIENT_TRANSPORT_CODES.has(code);
    return {
      code,
      phase,
      hostCategory: hostCategory(hostname),
      retryable,
      summary: `transport phase=${phase} code=${code} host=${hostCategory(hostname)} retryable=${String(retryable)}`,
    };
  }
  return null;
}

function describeUnclassifiedError(error) {
  const name =
    error &&
    typeof error === 'object' &&
    SAFE_CODE_PATTERN.test(String(error.name || '').toUpperCase())
      ? String(error.name).toUpperCase()
      : 'ERROR';
  const message = compactSanitizedMessage(
    error && typeof error === 'object' ? error.message || '' : error
  );
  return `unclassified name=${name} message=${message || 'unavailable'}`;
}

module.exports = {
  compactSanitizedMessage,
  describeTransportError,
  describeUnclassifiedError,
  hostCategory,
};
