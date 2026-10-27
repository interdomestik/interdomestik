import { getMock } from './registry.mjs';
const { relayLegacyAdminAssignment, assignmentRelayFailure } = getMock("@/server/operations/m4-assignment-relay");
const { revalidatePath } = getMock('next/cache');
const LOCALES = ['sq', 'en', 'sr', 'mk'];
function revalidatePathForAllLocales(path) {
    for (const locale of LOCALES)
        revalidatePath(`/${locale}${path}`);
}
export async function assignClaimCore(params) {
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
//# sourceMappingURL=wrapper.source.js.map