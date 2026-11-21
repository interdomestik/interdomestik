import { defineRoute } from '@/lib/safe-route';
import { z } from 'zod';

import { BODY_CAP, mocks } from './test-support';

export const POST = defineRoute({
  name: 'fixtures.body',
  method: 'POST',
  basis: { kind: 'self' },
  subject: { type: 'none' },
  body: z.strictObject({ note: z.string() }),
  maxBodyBytes: BODY_CAP,
  handler: (input, ctx) => mocks.body(input, ctx),
});
