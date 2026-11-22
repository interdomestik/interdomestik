import { defineRoute } from '@/lib/safe-route';
import { z } from 'zod';

import { mocks } from './test-support';

export const POST = defineRoute({
  name: 'fixtures.self',
  method: 'POST',
  basis: { kind: 'self' },
  subject: { type: 'self' },
  body: z.strictObject({ note: z.string() }),
  handler: (input, ctx) => mocks.self(input, ctx),
});
