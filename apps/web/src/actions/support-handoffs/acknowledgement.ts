'use server';

import { getActionContext } from './context';
import { acknowledgeSupportHandoffPublicResponseCore } from './acknowledgement.core';

export type PublicResponseAcknowledgementActionState = {
  acknowledgedAt?: string;
  code?: string;
  error?: string;
  success: boolean;
};

const INITIAL_FAILURE: PublicResponseAcknowledgementActionState = {
  error: 'Unable to acknowledge this support update.',
  success: false,
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getExpectedPublicResponseVersion(formData: FormData) {
  const parsed = Number(getString(formData, 'expectedPublicResponseVersion'));
  return Number.isFinite(parsed) ? parsed : -1;
}

export async function acknowledgeSupportHandoffPublicResponse(
  _previousState: PublicResponseAcknowledgementActionState,
  formData: FormData
): Promise<PublicResponseAcknowledgementActionState> {
  const { session, requestHeaders } = await getActionContext();
  const result = await acknowledgeSupportHandoffPublicResponseCore({
    expectedPublicResponseVersion: getExpectedPublicResponseVersion(formData),
    handoffId: getString(formData, 'handoffId'),
    requestHeaders,
    session,
  });

  if (!result.success) {
    return {
      code: result.code,
      error: result.error || INITIAL_FAILURE.error,
      success: false,
    };
  }

  return {
    acknowledgedAt: result.data.acknowledgedAt,
    success: true,
  };
}
