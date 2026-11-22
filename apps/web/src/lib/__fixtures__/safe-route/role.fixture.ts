import { ROLE_STAFF } from '@/lib/roles.core';
import { actionNormalizers } from '@/lib/safe-action';
import { defineRoute } from '@/lib/safe-route';
import { z } from 'zod';

import { mocks } from './test-support';

export const POST = defineRoute({
  name: 'fixtures.role',
  method: 'POST',
  basis: { kind: 'role', roles: [ROLE_STAFF] },
  subject: { type: 'claim', from: 'params.caseId' },
  params: z.strictObject({
    caseId: z
      .string()
      .check(actionNormalizers.toLowerCase)
      .refine(value => mocks.refine(value)),
    rest: z.array(z.string()).optional(),
  }),
  query: z.strictObject({
    term: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  body: z.strictObject({ note: z.string().min(1) }),
  rateLimit: { limit: 4, windowSeconds: 30 },
  handler: (input, ctx) => mocks.role(input, ctx),
});
