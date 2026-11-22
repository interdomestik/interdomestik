import { LOCALES } from '@/i18n/locales';
import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  changeClaimAssignment,
  changeClaimAssignmentInputSchema,
} from '@interdomestik/domain-claims/staff-claims/assign';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

export const assignClaimCore = defineAction({
  name: 'staffClaims.assign',
  basis: { kind: 'role', roles: ['staff'] },
  input: changeClaimAssignmentInputSchema,
  subject: { type: 'claim', from: 'claimId' },
  async handler(input, { authority, requestHeaders }) {
    const outcome = await changeClaimAssignment(authority, input, { requestHeaders });
    if (!outcome.ok) {
      const t = await getTranslations('common.claimStatusErrors');
      if (outcome.code === 'forbidden_role') return actionFailure('FORBIDDEN', t('forbidden'));
      if (outcome.code === 'not_found') return actionFailure('NOT_FOUND', t('notFound'));
      if (outcome.code === 'conflict') return actionFailure('conflict', t('conflict'));
      if (outcome.code === 'target_denied')
        return actionFailure('target_denied', t('assignmentTarget'));
      return actionFailure(outcome.code, t('assignmentFailed'));
    }
    try {
      for (const locale of LOCALES) {
        revalidatePath(`/${locale}/staff/claims/${input.claimId}`);
        revalidatePath(`/${locale}/staff/claims`);
      }
    } catch (error) {
      console.error('Staff assignment refresh failed after commit', error);
    }
  },
});
