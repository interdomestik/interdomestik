import type { RateLimitOptions, RateLimitResult } from '@/lib/rate-limit.core';

import type { ActionError } from './safe-action.types';

// Public intake, as a pure function (design §1.3, r8 B17). No production code calls it in part 1:
// both production factories refuse a public basis, and CHK-04 reports any importer outside its
// own test. The flip PR for CHK-04 and CHK-26 wires it into the factories, with its own gate.

export type PublicRegistryEntry = {
  id: string;
  kind: string;
  operation?: string;
  rateLimit?: { limit: unknown; windowSeconds: unknown };
};

export type PublicRegistry = { version: number; entries: readonly PublicRegistryEntry[] };

export type PublicIntakeDeps = {
  rateLimit: (options: RateLimitOptions) => Promise<RateLimitResult>;
  headers: Headers;
};

export class PublicIntakeConfigurationError extends Error {
  constructor(detail: string) {
    super(`public intake: ${detail}`);
    this.name = 'PublicIntakeConfigurationError';
  }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Resolves the declared entry from the supplied registry and checks it binds this operation, all
 * before the limiter is called; then limits under the production-sensitive (fail-closed) policy.
 */
export async function runPublicIntake<I>(
  request: { declaredName: string; entryId: string; registry: PublicRegistry; input: I },
  deps: PublicIntakeDeps
): Promise<{ ok: true; input: I } | ActionError> {
  const { declaredName, entryId, registry } = request;
  const entry = registry.entries.find(candidate => candidate.id === entryId);
  if (!entry) throw new PublicIntakeConfigurationError(`unknown entry ${entryId}`);
  if (entry.kind !== 'server-action') {
    throw new PublicIntakeConfigurationError(`entry ${entryId} is not a server-action entry`);
  }
  if (entry.operation !== declaredName) {
    throw new PublicIntakeConfigurationError(`entry ${entryId} does not bind ${declaredName}`);
  }
  const limit = entry.rateLimit?.limit;
  const windowSeconds = entry.rateLimit?.windowSeconds;
  if (!positiveInteger(limit) || !positiveInteger(windowSeconds)) {
    throw new PublicIntakeConfigurationError(`entry ${entryId} has no finite positive rate limit`);
  }

  const limited = await deps.rateLimit({
    name: `public:${declaredName}`,
    limit,
    windowSeconds,
    headers: deps.headers,
    productionSensitive: true,
  });
  if (!limited.limited) return { ok: true, input: request.input };
  const code = limited.status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE';
  return {
    success: false,
    error: limited.error,
    code,
    ...(limited.retryAfter === undefined ? {} : { retryAfter: limited.retryAfter }),
  };
}
