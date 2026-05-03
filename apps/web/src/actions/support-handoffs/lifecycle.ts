'use server';

import { getActionContext } from './context';
import {
  acceptSupportHandoffCore,
  closeSupportHandoffCore,
  reassignSupportHandoffCore,
} from './lifecycle.core';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getExpectedVersion(formData: FormData) {
  const raw = getString(formData, 'expectedVersion');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function acceptSupportHandoff(formData: FormData) {
  const { session, requestHeaders } = await getActionContext();
  await acceptSupportHandoffCore({
    handoffId: getString(formData, 'handoffId'),
    expectedVersion: getExpectedVersion(formData),
    requestHeaders,
    session,
  });
}

export async function reassignSupportHandoff(formData: FormData) {
  const { session, requestHeaders } = await getActionContext();
  await reassignSupportHandoffCore({
    handoffId: getString(formData, 'handoffId'),
    expectedVersion: getExpectedVersion(formData),
    nextStaffId: getString(formData, 'nextStaffId'),
    reason: getString(formData, 'reason'),
    requestHeaders,
    session,
  });
}

export async function closeSupportHandoff(formData: FormData) {
  const { session, requestHeaders } = await getActionContext();
  await closeSupportHandoffCore({
    handoffId: getString(formData, 'handoffId'),
    expectedVersion: getExpectedVersion(formData),
    reason: getString(formData, 'reason'),
    requestHeaders,
    session,
  });
}
