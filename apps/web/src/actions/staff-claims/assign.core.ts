import {
  relayStaffAssignment,
  assignmentRelayFailure,
} from '@/server/operations/m4-assignment-relay';
import { revalidatePath } from 'next/cache';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) revalidatePath(`/${locale}${path}`);
}
export async function assignClaimCore(params: {
  claimId: string;
  staffId?: string | null;
  requestHeaders: Headers;
  operationId?: string;
}) {
  const response = await relayStaffAssignment(params);
  if (response.status !== 'completed') {
    return assignmentRelayFailure(response, 'staff');
  }
  if (response.result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
  }
  return response.result;
}
