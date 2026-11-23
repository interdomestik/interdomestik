import { ROLE_STAFF } from '@/lib/roles.core';
import { defineRoute } from '@/lib/safe-route';
import { z } from 'zod';

import { mocks } from './test-support';

export const POST = defineRoute({
  name: 'fixtures.query',
  method: 'POST',
  basis: { kind: 'role', roles: [ROLE_STAFF] },
  subject: { type: 'claim', from: 'query.caseId' },
  query: z.strictObject({ caseId: z.string(), term: z.string().optional() }),
  handler: (input, ctx) => mocks.query(input, ctx),
});
