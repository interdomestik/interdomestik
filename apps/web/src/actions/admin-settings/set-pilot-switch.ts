'use server';

import { actionFailure, actionNormalizers, defineAction } from '@/lib/safe-action';
import { changePilotSwitch, PILOT_SWITCH_KEYS } from '@interdomestik/database/pilot-switch';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ROLES } from '@interdomestik/shared-auth';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

export const setPilotSwitch = defineAction({
  name: 'adminSettings.setPilotSwitch',
  basis: { kind: 'role', roles: [ROLES.super_admin, ROLES.tenant_admin] },
  input: z.strictObject({
    key: z.enum(PILOT_SWITCH_KEYS),
    enabled: z.boolean(),
    expectedRevision: z.int().nonnegative(),
    reason: z.string().check(actionNormalizers.trim).min(10).max(500),
    approvalReference: z.string().check(actionNormalizers.trim).min(1).max(200).optional(),
  }),
  subject: { type: 'none' },
  async handler(input, { authority }) {
    const result = await withTenantAuthority(authority, tx =>
      changePilotSwitch(tx, authority, input)
    );
    if (result.ok) {
      return result.switch;
    }
    if (result.code === 'FORBIDDEN') {
      return actionFailure('FORBIDDEN');
    }

    const t = await getTranslations('admin.settings_page.pilot');
    if (result.code === 'APPROVAL_REQUIRED') {
      return actionFailure('VALIDATION_ERROR', t('approval_required'));
    }
    return actionFailure('CONFLICT', t('conflict'));
  },
});
