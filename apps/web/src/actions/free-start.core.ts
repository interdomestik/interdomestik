'use server';

import { headers } from 'next/headers';

import type { SubmitFreeStartIntakeInput } from '@/lib/validators/free-start';

import { submitFreeStartIntakeCore } from './free-start/submit.core';

export async function submitFreeStartIntake(
  data: SubmitFreeStartIntakeInput,
  idempotencyKey?: string
) {
  return submitFreeStartIntakeCore({
    idempotencyKey,
    requestHeaders: await headers(),
    data,
  });
}
