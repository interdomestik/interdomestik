const APPROVED_ORIGIN = 'https://interdomestik-9tjrc8i34-ecohub.vercel.app';
const APPROVED_COMMIT_SHA = 'a5dd1e455628b7c9826c80683237adcbd0d2d4f3';
const APPROVED_HOST_PATTERN = /^interdomestik-[a-z0-9]+-ecohub\.vercel\.app$/u;

export function validateImmutablePreviewDiagnosticTarget(target) {
  if (!target || typeof target !== 'object') {
    throw new Error('immutable preview diagnostic target must be an object');
  }
  let parsedOrigin;
  try {
    parsedOrigin = new URL(String(target.origin || ''));
  } catch {
    throw new Error('immutable preview diagnostic target origin must be a bare HTTPS origin');
  }
  if (
    parsedOrigin.protocol !== 'https:' ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== '/' ||
    parsedOrigin.search ||
    parsedOrigin.hash ||
    parsedOrigin.origin !== target.origin
  ) {
    throw new Error('immutable preview diagnostic target origin must be a bare HTTPS origin');
  }
  if (parsedOrigin.port || !APPROVED_HOST_PATTERN.test(parsedOrigin.hostname)) {
    throw new Error('immutable preview diagnostic target must use an approved Vercel preview host');
  }
  if (
    typeof target.expectedCommitSha !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(target.expectedCommitSha)
  ) {
    throw new Error(
      'immutable preview diagnostic target SHA must be 40 lowercase hexadecimal characters'
    );
  }
  return Object.freeze({
    origin: target.origin,
    expectedCommitSha: target.expectedCommitSha,
  });
}

export const IMMUTABLE_PREVIEW_DIAGNOSTIC_TARGET = validateImmutablePreviewDiagnosticTarget({
  origin: APPROVED_ORIGIN,
  expectedCommitSha: APPROVED_COMMIT_SHA,
});
