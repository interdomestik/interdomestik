'use server';

import type { FreeStartDraftContext } from '@interdomestik/database/free-start-drafts';
import {
  confirmFreeStartDraftHandoff as confirmDomainHandoff,
  reviewFreeStartDraftHandoff as reviewDomainHandoff,
} from '@interdomestik/domain-claims/claims/free-start-draft-handoff';
import { z } from 'zod';
import { headers } from 'next/headers';

import { resolveFreeStartDraftSession } from './session.core';

const idSchema = z.strictObject({ id: z.string().uuid() });
const confirmSchema = idSchema.extend({
  expectedVersion: z.number().int().positive(),
  locale: z.enum(['en', 'sq', 'sr', 'mk']),
});

export type FreeStartDraftHandoffDependencies = {
  confirmHandoff: typeof confirmDomainHandoff;
  resolveSession: typeof resolveFreeStartDraftSession;
  reviewHandoff: typeof reviewDomainHandoff;
};

const defaultDependencies: FreeStartDraftHandoffDependencies = {
  confirmHandoff: confirmDomainHandoff,
  resolveSession: resolveFreeStartDraftSession,
  reviewHandoff: reviewDomainHandoff,
};

async function runWithFreshContext<T>(
  requestHeaders: Headers,
  dependencies: FreeStartDraftHandoffDependencies,
  operation: (context: FreeStartDraftContext) => Promise<T>
) {
  const session = await dependencies.resolveSession(requestHeaders);
  if (!session.ok) return session;
  try {
    return await operation(session.context);
  } catch {
    return { ok: false, code: 'unavailable' } as const;
  }
}

export async function reviewFreeStartDraftHandoffCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return runWithFreshContext(requestHeaders, dependencies, context =>
    dependencies.reviewHandoff(context, parsed.data.id)
  );
}

export async function confirmFreeStartDraftHandoffCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return runWithFreshContext(requestHeaders, dependencies, context =>
    dependencies.confirmHandoff(context, parsed.data)
  );
}

export async function reviewFreeStartDraftHandoff(input: unknown) {
  return reviewFreeStartDraftHandoffCore(await headers(), input);
}

export async function confirmFreeStartDraftHandoff(input: unknown) {
  return confirmFreeStartDraftHandoffCore(await headers(), input);
}
