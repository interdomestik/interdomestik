import {getMock} from './registry.mjs';
const {relayLegacyAdminAssignment,assignmentRelayFailure}=getMock("@/server/operations/m4-assignment-relay");
const {revalidatePath}=getMock('next/cache');
const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) revalidatePath(`/${locale}${path}`);
}
export async function assignClaimCore(params: {
  claimId: string;
  staffId: string | null;
  requestHeaders: Headers;
  operationId?: string;
}) {
  const response = await relayLegacyAdminAssignment(params);
  if (response.status !== 'completed') {
    return assignmentRelayFailure(response, 'legacy-admin');
  }
  if (response.result.success && response.changed) {
    revalidatePathForAllLocales('/member/claims');
    revalidatePathForAllLocales(`/member/claims/${params.claimId}`);
    revalidatePathForAllLocales('/admin/claims');
    revalidatePathForAllLocales(`/admin/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
  }
  return response.result;
}
