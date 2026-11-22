import { ROLES } from '@interdomestik/shared-auth';
import { LOCALES } from '@/i18n/locales';
import { actionFailure, defineAction, type ProtectedActionContext } from '@/lib/safe-action';
import {
  changeClaimAssignment,
  changeClaimAssignmentInputSchema,
  type ChangeClaimAssignmentResult,
} from '@interdomestik/domain-claims/staff-claims/assign';
import { z } from 'zod';
import { type OpsActionResponse, revalidateClaim } from './action-helpers';
import {
  ASSIGNMENT_CONFLICT_ERROR,
  ASSIGNMENT_DRAFT_ERROR,
  ASSIGNMENT_TARGET_DENIED_ERROR,
} from './ops-assignment-errors';

const assignmentErrors = {
  forbidden_role: 'Unauthorized',
  invalid_input: ASSIGNMENT_TARGET_DENIED_ERROR,
  not_found: 'Claim not found or access denied',
  draft: ASSIGNMENT_DRAFT_ERROR,
  terminal: 'Cannot perform assign on a terminal claim.',
  target_denied: ASSIGNMENT_TARGET_DENIED_ERROR,
  conflict: ASSIGNMENT_CONFLICT_ERROR,
  transaction_failed: 'Assignment failed. Please try again.',
} satisfies Record<Extract<ChangeClaimAssignmentResult, { ok: false }>['code'], string>;

const basis = {
  kind: 'role',
  roles: [ROLES.admin, ROLES.tenant_admin, ROLES.super_admin],
} as const;
const subject = { type: 'claim', from: 'claimId' } as const;
const actionSchema = changeClaimAssignmentInputSchema
  .omit({ staffId: true })
  .extend({ locale: z.enum(LOCALES) })
  .strict();

async function changeAssignment(
  claimId: string,
  staffId: string | null,
  locale: string,
  { authority, requestHeaders }: ProtectedActionContext
) {
  const result = await changeClaimAssignment(authority, { claimId, staffId }, { requestHeaders });
  if (!result.ok) {
    const code = result.code === 'forbidden_role' ? 'FORBIDDEN' : result.code;
    return actionFailure(code, assignmentErrors[result.code]);
  }
  try {
    revalidateClaim(locale, claimId);
  } catch (error) {
    console.error('Claim assignment refresh failed after commit', error);
  }
  return result.assignment;
}

const assign = defineAction({
  name: 'adminClaims.assignOwner',
  basis,
  input: actionSchema.extend({ staffId: z.string() }).strict(),
  subject,
  handler: ({ claimId, staffId, locale }, ctx) => changeAssignment(claimId, staffId, locale, ctx),
});

const unassign = defineAction({
  name: 'adminClaims.unassignOwner',
  basis,
  input: actionSchema,
  subject,
  handler: ({ claimId, locale }, ctx) => changeAssignment(claimId, null, locale, ctx),
});

export async function assignOwnerAction(
  claimId: string,
  staffId: string,
  locale: string
): Promise<OpsActionResponse> {
  const result = await assign({ claimId, staffId, locale });
  return result.success ? result : { success: false, error: assignmentError(result) };
}

export async function unassignOwnerAction(
  claimId: string,
  locale: string
): Promise<OpsActionResponse> {
  const result = await unassign({ claimId, locale });
  if (!result.success) return { success: false, error: assignmentError(result) };
  if (!result.data) return result;
  const { id, staffId, assignedAt } = result.data;
  return { success: true, data: { id, staffId, assignedAt } };
}

function assignmentError(result: { error: string; code?: string }) {
  if (
    result.code === 'UNAUTHORIZED' ||
    result.code === 'FORBIDDEN' ||
    result.code === 'FORBIDDEN_NO_BRANCH' ||
    result.code === 'FORBIDDEN_NO_AGENT'
  ) {
    return assignmentErrors.forbidden_role;
  }
  if (result.code === 'VALIDATION_ERROR') return assignmentErrors.invalid_input;
  if (result.code === 'MISSING_TENANT' || result.code === 'INTERNAL_SERVER_ERROR') {
    return assignmentErrors.transaction_failed;
  }
  return result.error;
}
