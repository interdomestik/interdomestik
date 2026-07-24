const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const AUTHORIZATION_TTL_MS = 60 * 60_000;

export const MAC_FALLBACK_EXECUTOR = 'macos-arm64-diagnostic';
export const DEFAULT_FALLBACK_PORTS = [55321, 55322, 55323, 3200];
export const BASELINE_TUNNEL_PORTS = [3000, 54321, 54322, 54323, 11434, 2222];

function authorizationProblem(input, now, ttlMs) {
  if (!String(input.authorizedBy ?? '').trim()) return 'authorization_missing';
  const authorizedAt = Date.parse(String(input.authorizedAt ?? ''));
  if (!Number.isFinite(authorizedAt) || authorizedAt > now + 5 * 60_000) {
    return 'authorization_invalid';
  }
  if (now - authorizedAt > ttlMs) return 'authorization_expired';
  return null;
}

export function macFallbackProblems(
  input,
  { now = Date.now(), authorizationTtlMs = AUTHORIZATION_TTL_MS } = {}
) {
  const problems = [];
  const authorization = authorizationProblem(input, now, authorizationTtlMs);
  if (authorization) problems.push(authorization);

  if (input.z620Reachable === true) problems.push('primary_available');
  else if (input.z620Reachable !== false) problems.push('primary_reachability_unknown');
  if (!input.dockerReady) problems.push('docker_unavailable');
  if (!input.clean) problems.push('dirty_candidate');
  if (!SHA_PATTERN.test(String(input.sha ?? ''))) problems.push('invalid_sha');
  if (input.platform !== 'darwin') problems.push('invalid_platform');
  if (input.arch !== 'arm64') problems.push('invalid_architecture');
  if (!input.fallbackPortsFree) problems.push('fallback_ports_unavailable');

  const ports = Array.isArray(input.fallbackPorts) ? input.fallbackPorts : [];
  if (
    ports.length < 4 ||
    new Set(ports).size !== ports.length ||
    ports.some(port => !Number.isInteger(port) || port < 1 || port > 65_535)
  ) {
    problems.push('invalid_fallback_ports');
  }
  const overlap = ports.find(port => BASELINE_TUNNEL_PORTS.includes(port));
  if (overlap !== undefined) problems.push(`baseline_port_overlap:${overlap}`);
  return problems;
}

export function macFallbackDisposition(input, options) {
  const problems = macFallbackProblems(input, options);
  return {
    status: problems.length ? 'denied' : 'allowed',
    mode: 'diagnostic_only',
    executor: MAC_FALLBACK_EXECUTOR,
    pushPermitEligible: false,
    problems,
  };
}
