import { DrizzleQueryError } from 'drizzle-orm';

export function rateConstraint(error: unknown, state: string) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  if (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    cause.code === state &&
    'constraint_name' in cause &&
    typeof cause.constraint_name === 'string'
  ) {
    return cause.constraint_name;
  }
  return undefined;
}
