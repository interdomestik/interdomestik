import { inngest } from '@/lib/inngest/client';
import { inngestFunctions } from '@/lib/inngest/functions';
import { serve } from 'inngest/next';

// Create an API that serves Inngest scheduled functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
