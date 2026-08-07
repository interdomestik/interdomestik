'use server';

import { cookies, headers } from 'next/headers';

import {
  confirmReplacementEmailCore,
  expireRecoverySessionCache,
  startDifferentEmailRecoveryCore,
  submitCurrentEmailProofCore,
} from './different-email-recovery.core';

export async function startDifferentEmailRecovery(input: unknown) {
  return startDifferentEmailRecoveryCore(await headers(), input);
}

export async function submitCurrentEmailProof(input: unknown) {
  return submitCurrentEmailProofCore(await headers(), input);
}

export async function confirmReplacementEmail(input: unknown) {
  const result = await confirmReplacementEmailCore(await headers(), input);
  if (result.ok) expireRecoverySessionCache(await cookies());
  return result;
}
