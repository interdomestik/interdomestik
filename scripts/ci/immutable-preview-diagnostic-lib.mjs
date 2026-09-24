import { IMMUTABLE_PREVIEW_DIAGNOSTIC_TARGET } from './immutable-preview-diagnostic-target.mjs';

export const APPROVED_PREVIEW_ORIGIN = IMMUTABLE_PREVIEW_DIAGNOSTIC_TARGET.origin;
export const EXPECTED_COMMIT_SHA = IMMUTABLE_PREVIEW_DIAGNOSTIC_TARGET.expectedCommitSha;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOGIN_PATH = '/api/auth/sign-in/email';

export function assertApprovedPreviewOrigin(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error('diagnostic requires the approved immutable preview origin');
  }

  const isBareOrigin =
    parsed.origin === APPROVED_PREVIEW_ORIGIN &&
    parsed.protocol === 'https:' &&
    parsed.pathname === '/' &&
    !parsed.search &&
    !parsed.hash &&
    !parsed.username &&
    !parsed.password;
  if (!isBareOrigin) {
    throw new Error('diagnostic requires the approved immutable preview origin');
  }
  return parsed.origin;
}

export function assertExpectedHealth(payload, expectedSha) {
  if (expectedSha !== EXPECTED_COMMIT_SHA) {
    throw new Error('diagnostic expected commit SHA is not approved');
  }
  if (payload?.status !== 'healthy') {
    throw new Error('immutable preview health is not healthy');
  }
  if (payload.build?.commitSha !== expectedSha) {
    throw new Error('immutable preview commit SHA mismatch');
  }
  if (payload.build?.deployEnv !== 'preview') {
    throw new Error('diagnostic target is not a preview deployment');
  }
  return {
    status: 'healthy',
    commitSha: payload.build.commitSha,
    deployEnv: payload.build.deployEnv,
  };
}

export function createReadOnlyRequestPolicy(approvedOrigin) {
  const origin = assertApprovedPreviewOrigin(approvedOrigin);
  return request => {
    const method = String(request?.method || '').toUpperCase();
    let target;
    try {
      target = new URL(String(request?.url || ''));
    } catch {
      return 'block-origin';
    }
    if (target.origin !== origin) return 'block-origin';
    if (SAFE_METHODS.has(method)) return 'allow-read';
    if (
      method === 'POST' &&
      target.pathname === LOGIN_PATH &&
      !target.search &&
      !target.hash &&
      !target.username &&
      !target.password
    ) {
      return 'allow-login';
    }
    return 'block-unsafe';
  };
}

export function createPolicyEnforcedLoginRequest(request, approvedOrigin) {
  const classify = createReadOnlyRequestPolicy(approvedOrigin);
  return {
    async post(url, options) {
      if (classify({ method: 'POST', url }) !== 'allow-login') {
        throw new Error('diagnostic blocked non-canonical login POST');
      }
      return request.post(url, { ...options, maxRedirects: 0 });
    },
  };
}

export function resolveApprovedRedirect(currentUrl, location, approvedOrigin) {
  const origin = assertApprovedPreviewOrigin(approvedOrigin);
  const next = new URL(String(location || ''), String(currentUrl || ''));
  if (next.origin !== origin) {
    throw new Error('diagnostic redirect escaped the approved preview origin');
  }
  return next.href;
}

export function assertSameApprovedOrigin(value, approvedOrigin, label) {
  const origin = assertApprovedPreviewOrigin(approvedOrigin);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} returned an invalid URL`);
  }
  if (parsed.origin !== origin) throw new Error(`${label} escaped the approved preview origin`);
  return parsed;
}

export function sanitizeDiagnosticUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.origin !== APPROVED_PREVIEW_ORIGIN) {
      return '[EXTERNAL_ORIGIN]/[REDACTED_PATH]';
    }
    const safeExactPaths = new Set([
      '/',
      '/api/health',
      '/api/auth/sign-in/email',
      '/api/auth/get-session',
      '/api/monitoring',
    ]);
    if (safeExactPaths.has(parsed.pathname)) return `${APPROVED_PREVIEW_ORIGIN}${parsed.pathname}`;
    if (/^\/(?:en|sq|mk|sr)\/(?:login|admin)\/?$/u.test(parsed.pathname)) {
      return `${APPROVED_PREVIEW_ORIGIN}${parsed.pathname}`;
    }
    const userPathMatch = /^\/(en|sq|mk|sr)\/admin\/users\/([^/]+)(\/?)$/u.exec(parsed.pathname);
    if (userPathMatch) {
      const [, locale, , trailingSlash] = userPathMatch;
      return `${APPROVED_PREVIEW_ORIGIN}/${locale}/admin/users/[REDACTED_ID]${trailingSlash}`;
    }
    if (parsed.pathname.startsWith('/_next/')) return `${APPROVED_PREVIEW_ORIGIN}/_next/[ASSET]`;
    return `${APPROVED_PREVIEW_ORIGIN}/[REDACTED_PATH]`;
  } catch {
    return '[INVALID_URL]';
  }
}

export function sanitizePageTitle(value) {
  return String(value || '').trim() === 'Interdomestik - Consumer Protection'
    ? 'public-shell'
    : 'redacted';
}

export function classifyDiagnosticError(value) {
  const text = String(value || '').toLowerCase();
  if (/hydration|did not match|server rendered html/u.test(text)) return 'hydration';
  if (/chunkload|loading chunk|failed to fetch dynamically imported module/u.test(text)) {
    return 'chunk-load';
  }
  if (/network|failed to fetch|err_connection|err_name|timeout|socket/u.test(text))
    return 'network';
  if (/unauthorized|forbidden|permission|status (?:401|403)/u.test(text)) return 'permission';
  return 'generic';
}

export function sanitizeSessionSummary(payload, expectedEmail) {
  const user = payload?.user || payload?.session?.user || {};
  const safeField = value => {
    const normalized = String(value || '').trim();
    return /^[A-Za-z0-9_-]{1,80}$/u.test(normalized) ? normalized : null;
  };
  return {
    identityMatchesExpected:
      typeof user.email === 'string' &&
      user.email.trim().toLowerCase() ===
        String(expectedEmail || '')
          .trim()
          .toLowerCase(),
    role: safeField(user.role),
    tenantId: safeField(user.tenantId),
    accessTenantId: safeField(user.accessTenantId),
  };
}

export function assertTrustedPreflightReceipt(receipt, runId, runAttempt) {
  if (receipt?.status !== 'verified') throw new Error('preflight receipt is not verified');
  if (receipt.runId !== String(runId) || receipt.runAttempt !== String(runAttempt)) {
    throw new Error('preflight receipt belongs to a different workflow run');
  }
  if (receipt.origin !== APPROVED_PREVIEW_ORIGIN) {
    throw new Error('preflight receipt origin is not approved');
  }
  if (receipt.commitSha !== EXPECTED_COMMIT_SHA) {
    throw new Error('preflight receipt commit SHA mismatch');
  }
  if (receipt.deployEnv !== 'preview') throw new Error('preflight receipt is not a preview');
  return receipt;
}

export async function responseRedirectChain(response) {
  const chain = [];
  let request = response?.request?.() || null;
  while (request) {
    const prior = request.redirectedFrom();
    if (!prior) break;
    const priorResponse = await prior.response();
    chain.unshift({
      status: priorResponse?.status() ?? null,
      url: sanitizeDiagnosticUrl(prior.url()),
    });
    request = prior;
  }
  return chain;
}
