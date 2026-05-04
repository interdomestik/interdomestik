'use server';

import { getActionContext } from './context';
import { updateSupportHandoffPublicResponseCore } from './response.core';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getExpectedVersion(formData: FormData) {
  const raw = getString(formData, 'expectedVersion');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function updateSupportHandoffPublicResponse(formData: FormData) {
  const { session, requestHeaders } = await getActionContext();
  await updateSupportHandoffPublicResponseCore({
    handoffId: getString(formData, 'handoffId'),
    expectedVersion: getExpectedVersion(formData),
    requestHeaders,
    response: getString(formData, 'publicResponse'),
    session,
  });
}
