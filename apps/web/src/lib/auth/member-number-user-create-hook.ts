import { dbAdmin } from '@interdomestik/database/db';
import { generateMemberNumberWithRetry } from '@interdomestik/database/member-number';

import { captureMemberNumberLifecycleEvent } from './member-number-observability';

type CreatedUser = {
  id: string;
  role?: string | null;
  memberNumber?: string | null;
  createdAt?: Date | string | null;
  joinedAt?: Date | string | null;
};

export async function runMemberNumberUserCreateHook(user: CreatedUser): Promise<void> {
  if (user.role !== 'member' || user.memberNumber) return;

  try {
    const dateSource = user.joinedAt ?? user.createdAt;
    if (!dateSource) {
      throw new Error('Member year source unavailable');
    }
    const joinedAt = new Date(dateSource);
    const result = await generateMemberNumberWithRetry(dbAdmin, {
      userId: user.id,
      joinedAt,
    });
    captureMemberNumberLifecycleEvent('user_create_after_assigned', {
      createdYear: joinedAt.getFullYear(),
      isNew: result.isNew,
    });
  } catch {
    captureMemberNumberLifecycleEvent('user_create_after_failed');
  }
}
