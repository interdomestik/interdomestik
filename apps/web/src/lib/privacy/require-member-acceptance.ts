import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import { cache } from 'react';

import { enforceRateLimit } from '@/lib/rate-limit';
import { isLocalE2ERuntime, isProductionDeployment } from '@/lib/runtime-environment';
import { actionFailure, type ActionFailure } from '@/lib/safe-action';
import { assertSessionContext } from '@/lib/safe-action.basis';
import { failureOfThrown, finalize } from '@/lib/safe-action.core';
import { toActionError } from '@/lib/safe-action.failure';
import { assertPristineObjectPrototype } from '@/lib/safe-action.recheck';
import type { ActionResult } from '@/lib/safe-action.types';
import { authorizeSessionTenant, type AuthorizedSession } from '@/lib/tenant-authority.server';
import {
  isTenantAuthority,
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import {
  checkRenderedLegalTexts,
  isLegalAcceptanceRole,
  readOwnAcceptanceState,
  type LegalDocument,
  type RenderedLegalText,
} from '@interdomestik/domain-privacy/acceptance';
import { MissingTenantError, ROLES } from '@interdomestik/shared-auth';
import { issueLegalAcceptanceFormToken } from './legal-acceptance-form-token';

const knownRoles: ReadonlySet<string> = new Set(Object.values(ROLES));

type AcceptanceRefusal = {
  ok: false;
  failure: ActionFailure;
  missing?: LegalDocument[];
};

type RequestAdmission = Readonly<{ ok: true; authorized: AuthorizedSession } | AcceptanceRefusal>;

export function requireApprovedLegalDocuments(): boolean {
  return isProductionDeployment() && !isLocalE2ERuntime();
}

async function checkMemberAcceptance(
  authority: TenantAuthority
): Promise<AcceptanceRefusal | null> {
  const { principal, purpose } = readTenantAuthority(authority);
  const role = principal?.role;
  if (purpose !== 'session' || !role) return { ok: false, failure: actionFailure('FORBIDDEN') };
  if (isLegalAcceptanceRole(role)) {
    const state = await readOwnAcceptanceState(authority, requireApprovedLegalDocuments());
    if (state.accepted) return null;
    return {
      ok: false,
      failure: actionFailure('acceptance_required'),
      missing: state.missing,
    };
  }
  return knownRoles.has(role) ? null : { ok: false, failure: actionFailure('FORBIDDEN') };
}

export async function requireMemberAcceptance(
  authority: TenantAuthority
): Promise<ActionFailure | null> {
  return (await checkMemberAcceptance(authority))?.failure ?? null;
}

async function resolveSession(headers?: Headers) {
  try {
    return await authorizeSessionTenant(headers);
  } catch (error) {
    if (error instanceof MissingTenantError) return null;
    throw error;
  }
}

const pageSession = cache(() => resolveSession());

export async function resolveMemberAcceptanceForRequest(
  headers?: Headers
): Promise<RequestAdmission> {
  const authorized = headers ? await resolveSession(headers) : await pageSession();
  if (!authorized || !isTenantAuthority(authorized.authority)) {
    return Object.freeze({ ok: false, failure: actionFailure('UNAUTHORIZED') });
  }
  const refusal = await checkMemberAcceptance(authorized.authority);
  if (refusal) return Object.freeze(refusal);
  return Object.freeze({ ok: true, authorized: Object.freeze(authorized) });
}

const requestAdmission = new AsyncLocalStorage<Promise<RequestAdmission>>();
const pageAdmission = cache(() => resolveMemberAcceptanceForRequest());

export function requireAdmittedMember(): Promise<RequestAdmission> {
  return requestAdmission.getStore() ?? pageAdmission();
}

export async function checkMemberAcceptanceTexts(
  locale: string,
  texts: readonly RenderedLegalText[]
) {
  const authorized = await pageSession();
  if (!authorized || !isLegalAcceptanceRole(authorized.session.user.role)) {
    return { ok: false, code: 'legal_text_mismatch' } as const;
  }

  const verification = await checkRenderedLegalTexts(authorized.authority, {
    locale,
    texts,
    requireApproved: requireApprovedLegalDocuments(),
  });
  if (!verification.ok) return verification;
  const formToken = await issueLegalAcceptanceFormToken(authorized.session.user.id, locale, texts);
  return { ...verification, formToken };
}

export async function requireMemberAcceptancePage() {
  return requireAdmittedMember();
}

export function memberGuarded<Args extends unknown[], Result>(
  handler: (authorized: AuthorizedSession, ...args: Args) => Promise<Result>
) {
  return async (...args: Args) => {
    const pending = resolveMemberAcceptanceForRequest();
    return await requestAdmission.run(pending, async () => {
      const admission = await pending;
      if (!admission.ok) return toActionError(admission.failure);
      return handler(admission.authorized, ...args);
    });
  };
}

/** Retain legacy action result and refusal handling with the already admitted session. */
export async function runAdmittedAction<T>(
  authorized: AuthorizedSession,
  handler: () => Promise<T>
): ActionResult<T> {
  assertPristineObjectPrototype();
  const { session, authority } = authorized;
  const actor = { authority, actorId: session.user.id, actorRole: session.user.role ?? null };
  const operation = {
    name: 'legacy',
    basis: { kind: 'legacy' },
    subject: null,
    form: false,
  } as const;
  let outcome: T | ActionFailure;
  try {
    assertSessionContext(session);
    outcome = await handler();
    assertPristineObjectPrototype();
  } catch (error) {
    outcome = failureOfThrown(error, operation.name);
  }
  return finalize(operation, undefined, outcome, actor);
}

export function withMemberAcceptance<Args extends unknown[]>(
  handler: (authorized: AuthorizedSession, request: Request, ...args: Args) => Promise<Response>,
  options?: {
    rateLimit?: Omit<Parameters<typeof enforceRateLimit>[0], 'headers'>;
    authenticationRefusal?: () => Response;
    onError?: (error: unknown) => Response;
  }
) {
  return async (request: Request, ...args: Args) => {
    try {
      if (options?.rateLimit) {
        const limited = await enforceRateLimit({ ...options.rateLimit, headers: request.headers });
        if (limited) return limited;
      }
      const pending = resolveMemberAcceptanceForRequest(request.headers);
      return await requestAdmission.run(pending, async () => {
        const admission = await pending;
        if (admission.ok) return handler(admission.authorized, request, ...args);
        const unauthorized = admission.failure.code === 'UNAUTHORIZED';
        if (unauthorized && options?.authenticationRefusal) return options.authenticationRefusal();
        return Response.json(
          { error: admission.failure.code },
          { status: unauthorized ? 401 : 403 }
        );
      });
    } catch (error) {
      if (!options?.onError) throw error;
      return options.onError(error);
    }
  };
}
