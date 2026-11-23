export function formatRateVerificationLimitFailure(error: unknown): string {
  const summary = 'Rate verification limit operation failed';
  if (!(error instanceof Error)) return `${summary} (unknown error class)`;

  const details = [error.constructor.name || 'Error'];
  const code = 'code' in error ? error.code : undefined;
  const constraint = 'constraint_name' in error ? error.constraint_name : undefined;
  if (typeof code === 'string' && /^[A-Z0-9]{5}$/u.test(code)) {
    details.push(`code=${code}`);
  }
  if (typeof constraint === 'string' && /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/u.test(constraint)) {
    details.push(`constraint_name=${constraint}`);
  }

  // The disposable target guard throws a plain Error with a fixed classification.
  if (error.constructor === Error && !('code' in error)) {
    const refusal =
      /^Seed target refused: (ambiguous|invalid|non-disposable|non-local-unconfirmed|production)$/u.exec(
        error.message
      )?.[1];
    if (refusal) return `Seed target refused: ${refusal} (${details.join(', ')})`;
  }

  return `${summary} (${details.join(', ')})`;
}
