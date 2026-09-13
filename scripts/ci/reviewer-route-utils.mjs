import fs from 'node:fs';
import path from 'node:path';

export function providerFailureReason(text) {
  for (const [pattern, reason] of [
    [/UNSUPPORTED_CLIENT|unsupported client/iu, 'unsupported_client'],
    [/quota|rate.?limit|resource.?exhausted|429|capacity exhausted/iu, 'quota_or_rate_limit'],
    [
      /not logged in|login required|unauthenticated|authentication.failed|401|oauth/iu,
      'login_required',
    ],
    [
      /503|502|504|service unavailable|upstream|temporarily unavailable|overloaded/iu,
      'upstream_unavailable',
    ],
  ])
    if (pattern.test(text)) return reason;
  return '';
}

export function commandAvailable(command, env) {
  const candidates = command.includes(path.sep)
    ? [command]
    : String(env.PATH || '')
        .split(path.delimiter)
        .filter(Boolean)
        .map(dir => path.join(dir, command));
  return candidates.some(candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function safeTimeout(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

export function timeoutConfig(routeName, preset = 'default') {
  if (preset === 'test-no-output') return { firstOutputTimeoutMs: 50, totalTimeoutMs: 400 };
  if (preset === 'test-total') return { firstOutputTimeoutMs: 400, totalTimeoutMs: 80 };
  let totalTimeoutMs = 10 * 60_000;
  if (routeName === 'opus') {
    totalTimeoutMs = 30 * 60_000;
  }
  return { firstOutputTimeoutMs: 300_000, totalTimeoutMs };
}

export function statusForClose(blockerReason, code) {
  if (blockerReason) return 'blocked';
  if (code === 0) return 'ran';
  return 'failed';
}

const BLOCKERS = [
  [
    /AuthorizationRequired|re-authorization required|OAuth token refresh failed/i,
    'mcp_auth_required',
  ],
  [/401 Unauthorized|Missing bearer or basic authentication/i, 'api_auth_required'],
  [
    /rate limit|quota exceeded|insufficient_quota|429|too many requests|resource exhausted/i,
    'quota_or_rate_limit',
  ],
  [/Please login|not logged in|login required/i, 'login_required'],
  [/ENOENT|command not found|not found|not on PATH/i, 'missing_cli'],
];

export function classifyBlocker(text) {
  return BLOCKERS.find(([pattern]) => pattern.test(text))?.[1] || '';
}
