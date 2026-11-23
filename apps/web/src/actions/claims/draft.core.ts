import {
  cancelClaimCore as cancelClaimCoreDomain,
  updateDraftClaimCore as updateDraftClaimCoreDomain,
} from '@interdomestik/domain-claims/claims/draft';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { CreateClaimValues } from '@interdomestik/domain-claims/validators/claims';

import { initialClaimEvidenceValidatorFor } from '@/features/claims/upload/server/initial-claim-evidence-validation';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function updateDraftClaimCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  requestHeaders: Headers;
  claimId: string;
  data: CreateClaimValues;
}) {
  return updateDraftClaimCoreDomain(params, {
    logAuditEvent,
    revalidatePath,
    validateSubmittedClaimFile: initialClaimEvidenceValidatorFor(params.authority, {
      actorRole: params.session?.user.role ?? null,
    }),
  });
}

export async function cancelClaimCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  requestHeaders: Headers;
  claimId: string;
}) {
  return cancelClaimCoreDomain(params, {
    logAuditEvent,
    revalidatePath,
  });
}
