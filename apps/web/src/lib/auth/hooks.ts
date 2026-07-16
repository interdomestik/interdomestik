import type { BetterAuthOptions } from 'better-auth';

import { runMemberNumberSessionHook } from './member-number-session-hook';
import { runMemberNumberUserCreateHook } from './member-number-user-create-hook';

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
  user: {
    create: {
      before: async user => {
        if (user.role === 'user') {
          return { data: { ...user, role: 'member' } };
        }
      },
      after: async user => runMemberNumberUserCreateHook(user),
    },
  },
  session: {
    create: {
      after: async session => runMemberNumberSessionHook(session),
    },
  },
};
