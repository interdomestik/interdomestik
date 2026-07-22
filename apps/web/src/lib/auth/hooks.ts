import type { BetterAuthOptions } from 'better-auth';

import { runMemberNumberSessionHook } from './member-number-session-hook';
import { runMemberNumberUserCreateHook } from './member-number-user-create-hook';
import {
  assertUserAuthorityUpdateBefore,
  assignUserAuthorityBeforeCreate,
} from './user-authority-assignment';

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
  user: {
    create: {
      before: (user, context) => assignUserAuthorityBeforeCreate(user, context),
      after: async user => runMemberNumberUserCreateHook(user),
    },
    update: { before: async data => assertUserAuthorityUpdateBefore(data) },
  },
  session: {
    create: {
      after: async session => runMemberNumberSessionHook(session),
    },
  },
};
