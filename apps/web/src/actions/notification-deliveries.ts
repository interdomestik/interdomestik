'use server';

import { actionFailure, defineAction } from '@/lib/safe-action';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import {
  listFailedNotificationDeliveries as listFailed,
  redriveNotificationDelivery as redrive,
} from '@interdomestik/domain-communications/notification-deliveries';
import { ROLES } from '@interdomestik/shared-auth';
import { z } from 'zod';

const basis = {
  kind: 'role',
  roles: [ROLES.admin, ROLES.tenant_admin, ROLES.super_admin],
} as const;
const id = z.string().min(1).max(128);

export const listFailedNotificationDeliveries = defineAction({
  name: 'notifications.listFailedDeliveries',
  basis,
  input: z.strictObject({
    limit: z.number().int().min(1).max(50),
    cursor: z.strictObject({ createdAt: z.iso.datetime({ offset: true }), id }).optional(),
  }),
  subject: { type: 'none' },
  async handler(input, { authority }) {
    return withTenantAuthority(authority, tx => listFailed(tx, input));
  },
});

export const redriveNotificationDelivery = defineAction({
  name: 'notifications.redriveDelivery',
  basis,
  input: z.strictObject({ id }),
  subject: { type: 'none' },
  async handler(input, { authority, session, userRole }) {
    const updated = await withTenantAuthority(authority, tx =>
      redrive(tx, input.id, {
        actorId: session.user.id,
        actorRole: userRole,
      })
    );
    return updated ? { id: input.id } : actionFailure('conflict');
  },
});
