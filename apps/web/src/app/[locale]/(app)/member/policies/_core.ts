import { createAdminClient, db } from '@interdomestik/database';
import { policies } from '@interdomestik/database/schema';
import { desc } from 'drizzle-orm';

type PolicyRow = typeof policies.$inferSelect;

export type PolicyWithSignedUrl = {
  policy: PolicyRow;
  fileHref: string;
};

export async function getPoliciesWithSignedUrlsCore(args: {
  tenantId: string;
  userId: string;
}): Promise<PolicyWithSignedUrl[]> {
  const { tenantId, userId } = args;
  const userPolicies = await db.query.policies.findMany({
    where: (policiesTable, { and, eq }) =>
      and(eq(policiesTable.userId, userId), eq(policiesTable.tenantId, tenantId)),
    orderBy: [desc(policies.createdAt)],
  });

  if (userPolicies.length === 0) {
    return [];
  }

  const adminClient = createAdminClient();
  const policiesBucket = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';

  return Promise.all(
    userPolicies.map(async policy => {
      const storedUrl = policy.fileUrl || '';
      if (!storedUrl) {
        return { policy, fileHref: '' };
      }

      if (storedUrl.startsWith('http://') || storedUrl.startsWith('https://')) {
        return { policy, fileHref: storedUrl };
      }

      const { data, error } = await adminClient.storage
        .from(policiesBucket)
        .createSignedUrl(storedUrl, 300);

      return { policy, fileHref: error ? '' : (data?.signedUrl ?? '') };
    })
  );
}
