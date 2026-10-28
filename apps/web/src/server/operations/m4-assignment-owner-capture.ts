import type { M4AssignmentOwnerConfiguration } from './m4-assignment-owner';
// Pure configuration snapshot; no owner registration or authority.
export function captureOwnerConfiguration(
  configuration: M4AssignmentOwnerConfiguration,
  local: boolean
) {
  const { runtime, tls, host, port, relayDeadlineMs } = configuration;
  if (
    host !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < (local ? 0 : 1) ||
    port > 65535 ||
    typeof tls.key !== 'string' ||
    tls.key.length > 65536 ||
    typeof tls.cert !== 'string' ||
    tls.cert.length > 65536 ||
    !tls.key.includes('PRIVATE KEY-----') ||
    !tls.cert.includes('-----BEGIN CERTIFICATE-----') ||
    !Number.isSafeInteger(relayDeadlineMs) ||
    relayDeadlineMs < 1 ||
    relayDeadlineMs > 2147483647
  )
    throw new Error('Invalid fixed assignment owner configuration');
  return Object.freeze({
    runtime: Object.freeze({ ...runtime }),
    tls: Object.freeze({ ...tls }),
    host,
    port,
    relayDeadlineMs,
  });
}
