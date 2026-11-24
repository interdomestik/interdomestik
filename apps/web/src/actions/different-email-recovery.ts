'use server';

import { cookies, headers } from 'next/headers';

import {
  confirmReplacementEmailCore,
  expireRecoverySessionCache,
  startDifferentEmailRecoveryCore,
  submitCurrentEmailProofCore,
  type RecoveryResult,
} from './different-email-recovery.core';

export async function startDifferentEmailRecovery(input: unknown): Promise<RecoveryResult> {
  return startDifferentEmailRecoveryCore(await headers(), input);
}

export async function submitCurrentEmailProof(input: unknown): Promise<RecoveryResult> {
  return submitCurrentEmailProofCore(await headers(), input);
}

export async function confirmReplacementEmail(input: unknown): Promise<RecoveryResult> {
  const result = await confirmReplacementEmailCore(await headers(), input);
  if (result.ok) expireRecoverySessionCache(await cookies());
  return result;
}
