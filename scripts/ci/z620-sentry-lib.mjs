const SHA_PATTERN = /^[0-9a-f]{40}$/u;

export function classifySentryConfig(env = process.env) {
  const required = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'];
  const missing = required.filter(name => !String(env[name] ?? '').trim());

  return {
    configured: missing.length === 0,
    missing,
    tokenExposed: false,
  };
}

export function validateSentryRelease(release, expectedSha) {
  const normalizedRelease = String(release ?? '').trim().toLowerCase();
  const normalizedSha = String(expectedSha ?? '').trim().toLowerCase();

  return SHA_PATTERN.test(normalizedSha) && normalizedRelease === normalizedSha;
}

export function assertReadOnlySentryMode(command) {
  if (command !== 'check') {
    throw new Error('Ordinary Z620 CI permits only the read-only Sentry check command.');
  }
  return command;
}
