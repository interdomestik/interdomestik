'use server';

import { getActionContext } from './admin-claims/context';
import { updateClaimStatusCore } from './admin-claims/update-status';

export async function updateClaimStatus(formData: FormData) {
  const { session, requestHeaders } = await getActionContext();
  return updateClaimStatusCore({ formData, session, requestHeaders });
}
