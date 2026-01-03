import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth'; // auth-client imports are for client, server uses auth helper
import { createAdminClient, db } from '@interdomestik/database';
import { policies } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { desc } from 'drizzle-orm';
import { FileText, Plus, Shield } from 'lucide-react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

type PolicyAnalysis = {
  summary?: string;
  coverageAmount?: number | string;
  currency?: string;
  deductible?: number | string;
  hiddenPerks?: string[];
};

export default async function PoliciesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);
  const userPolicies = await db.query.policies.findMany({
    where: (policiesTable, { and, eq }) =>
      and(eq(policiesTable.userId, session.user.id), eq(policiesTable.tenantId, tenantId)),
    orderBy: [desc(policies.createdAt)],
  });

  const adminClient = createAdminClient();
  const policiesBucket = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';
  const policiesWithUrls = await Promise.all(
    userPolicies.map(async policy => {
      const storedUrl = policy.fileUrl;
      if (storedUrl.startsWith('http://') || storedUrl.startsWith('https://')) {
        return { policy, fileHref: storedUrl };
      }

      const { data, error } = await adminClient.storage
        .from(policiesBucket)
        .createSignedUrl(storedUrl, 300);

      return { policy, fileHref: error ? '' : (data?.signedUrl ?? '') };
    })
  );

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Policies</h1>
          <p className="text-muted-foreground">
            Manage your insurance documents and see AI insights.
          </p>
        </div>
        <Link href="/member/policies/upload">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Policy
          </Button>
        </Link>
      </div>

      {userPolicies.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No policies uploaded yet</h3>
          <p className="text-muted-foreground max-w-sm mt-2 mb-6">
            Upload your insurance policy to unlock AI-powered insights, hidden perks, and advocacy
            tools.
          </p>
          <Link href="/dashboard/policies/upload">
            <Button variant="outline">Upload First Policy</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {policiesWithUrls.map(({ policy, fileHref }) => {
            const analysis = policy.analysisJson as PolicyAnalysis | null;
            return (
              <Card key={policy.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="bg-muted/30 pb-4">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-background rounded border shadow-sm">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    {analysis?.summary && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                        AI Analyzed
                      </span>
                    )}
                  </div>
                  <CardTitle className="mt-4">{policy.provider || 'Unknown Provider'}</CardTitle>
                  <CardDescription>#{policy.policyNumber || 'No Number'}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Coverage:</span>
                    <span className="font-semibold">
                      {analysis?.coverageAmount
                        ? `${analysis.coverageAmount} ${analysis?.currency || 'EUR'}`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deductible:</span>
                    <span className="text-red-500 font-medium">
                      {analysis?.deductible
                        ? `${analysis.deductible} ${analysis?.currency || 'EUR'}`
                        : 'N/A'}
                    </span>
                  </div>

                  {analysis?.hiddenPerks && analysis.hiddenPerks.length > 0 && (
                    <div className="pt-2 border-t mt-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        HIDDEN PERKS
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.hiddenPerks.slice(0, 2).map((perk, i) => (
                          <span
                            key={i}
                            className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100"
                          >
                            {perk}
                          </span>
                        ))}
                        {analysis.hiddenPerks.length > 2 && (
                          <span className="text-xs text-muted-foreground px-2 py-1">
                            +{analysis.hiddenPerks.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 flex gap-2">
                    {fileHref ? (
                      <Button variant="outline" className="w-full text-xs" asChild>
                        <Link href={fileHref} target="_blank">
                          View PDF
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full text-xs" disabled>
                        View PDF
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
