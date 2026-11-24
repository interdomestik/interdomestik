import { readFreeStartDraftIntakeOpen } from '@interdomestik/database/free-start-drafts';
import * as Sentry from '@sentry/nextjs';
import { getTranslations } from 'next-intl/server';

import { resolvePublicAdmissionTenant } from '@/lib/tenant/public-admission-tenant';
import { isPublicIntakeOpenForTenant } from '@/lib/tenant/public-intake-admission';

import { hasAdmittedClaimEntitlement } from './claim-entitlement.core';
import type { FreeStartDraftLifecycleDependencies } from './lifecycle.core';
import type { FreeStartDraftSessionResult } from './session.core';

export const draftWriteAdmissionDefaults: Pick<
  FreeStartDraftLifecycleDependencies,
  'readIntakeOpen' | 'readPublicIntakeOpen'
> = {
  readIntakeOpen: readFreeStartDraftIntakeOpen,
  async readPublicIntakeOpen(requestHeaders) {
    const tenantId = resolvePublicAdmissionTenant(requestHeaders);
    return tenantId ? isPublicIntakeOpenForTenant(tenantId) : false;
  },
};

async function draftIntakeClosed() {
  const t = await getTranslations('freeStart');
  return { ok: false, code: 'CLOSED', error: t('draft.CLOSED') } as const;
}

export async function withDraftWriteAdmission<T>(
  requestHeaders: Headers,
  dependencies: FreeStartDraftLifecycleDependencies,
  operation: (session: Extract<FreeStartDraftSessionResult, { ok: true }>) => Promise<T>
) {
  const session = await dependencies.resolveSession(requestHeaders);
  if (!session.ok) {
    if (
      session.code === 'authRequired' &&
      !(await dependencies.readPublicIntakeOpen(requestHeaders))
    ) {
      return draftIntakeClosed();
    }
    return session;
  }

  if (session.emailVerified === true) {
    let entitled = false;
    try {
      entitled = await hasAdmittedClaimEntitlement(session.context);
    } catch (error) {
      Sentry.captureException(error, { tags: { operation: 'pilot.freeStartDraftIntake' } });
    }
    if (entitled) return operation(session);
  }

  let open = false;
  try {
    open = await dependencies.readIntakeOpen(session.context);
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'pilot.freeStartDraftIntake' } });
  }
  if (!open) return draftIntakeClosed();
  return operation(session);
}
