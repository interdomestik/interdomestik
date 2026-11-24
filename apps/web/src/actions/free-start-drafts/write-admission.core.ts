import { readFreeStartDraftIntakeOpen } from '@interdomestik/database/free-start-drafts';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { hasActiveMembership } from '@interdomestik/domain-membership-billing/subscription';
import * as Sentry from '@sentry/nextjs';
import { getTranslations } from 'next-intl/server';

import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';
import { resolvePublicAdmissionTenant } from '@/lib/tenant/public-admission-tenant';
import { isPublicIntakeOpenForTenant } from '@/lib/tenant/public-intake-admission';

import type { FreeStartDraftLifecycleDependencies } from './lifecycle.core';
import type { FreeStartDraftSessionResult } from './session.core';

export const draftWriteAdmissionDefaults: Pick<
  FreeStartDraftLifecycleDependencies,
  'hasClaimEntitlement' | 'readIntakeOpen' | 'readPublicIntakeOpen'
> = {
  async hasClaimEntitlement(context) {
    const authority = await authorizeSessionUserTenant(context.ownerUserId);
    if (!authority) return false;
    const { tenantId, accessTenantId } = readTenantAuthority(authority);
    if (tenantId !== context.tenantId || accessTenantId !== context.accessTenantId) return false;
    return hasActiveMembership(context.ownerUserId, authority);
  },
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
      entitled = await dependencies.hasClaimEntitlement(session.context);
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
