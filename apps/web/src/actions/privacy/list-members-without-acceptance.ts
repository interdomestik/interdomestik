'use server';

import { requireApprovedLegalDocuments } from '@/lib/privacy/require-member-acceptance';
import { actionFailure, defineAction } from '@/lib/safe-action';
import { listMembersWithoutAcceptance as reportAcceptance } from '@interdomestik/domain-privacy/acceptance';
import { ROLES } from '@interdomestik/shared-auth';
import { z } from 'zod';

export const listMembersWithoutAcceptance = defineAction({
  name: 'privacy.listMembersWithoutAcceptance',
  basis: { kind: 'role', roles: [ROLES.tenant_admin] },
  subject: { type: 'none' },
  input: z.strictObject({}),
  async handler(_input, { authority }) {
    const result = await reportAcceptance(authority, requireApprovedLegalDocuments());
    return result.ok ? result.members : actionFailure('FORBIDDEN');
  },
});
