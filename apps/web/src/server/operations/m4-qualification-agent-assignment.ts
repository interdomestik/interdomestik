// Qualification-only adapter; live agent assignments retain their existing path until cutover.
import {
  relayLegacyAgentAssignment,
  assignmentRelayFailure,
} from '@/server/operations/m4-assignment-relay';
import { revalidatePath } from 'next/cache';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) revalidatePath(`/${locale}${path}`);
}
export async function executeM4QualificationAgentAssignment(params: {
  claimId: string;
  staffId: string | null;
  requestHeaders: Headers;
  operationId?: string;
}) {
  const response = await relayLegacyAgentAssignment(params);
  if (response.status !== 'completed') {
    return assignmentRelayFailure(response, 'legacy-agent');
  }
  if (response.result.success) {
    revalidatePathForAllLocales('/member/claims');
    revalidatePathForAllLocales(`/member/claims/${params.claimId}`);
    revalidatePathForAllLocales('/admin/claims');
    revalidatePathForAllLocales(`/admin/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
  }
  return response.result;
}
