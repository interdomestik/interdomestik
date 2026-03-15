import { getAgentTier } from '@/app/[locale]/(agent)/agent/_layout.core';
import { GroupDashboardSummary } from '@/features/agent/import/components/group-dashboard-summary';
import { CSVUploader } from '@/features/agent/import/components/csv-uploader';
import { getGroupDashboardSummary } from '@/features/agent/import/server/get-group-dashboard-summary';
import { auth } from '@/lib/auth';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export default async function AgentImportPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.role !== 'agent') {
    redirect('/member');
  }

  const tier = await getAgentTier({ agentId: session.user.id });
  if (tier !== 'office') {
    notFound();
  }

  const summary = await getGroupDashboardSummary({
    agentId: session.user.id,
    tenantId: ensureTenantId(session),
  });

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-8 px-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-display font-bold tracking-tight">Sponsored Member Import</h1>
        <p className="text-muted-foreground">
          Upload a CSV roster to create individual member accounts in bulk through the agent write
          path.
        </p>
      </div>

      <GroupDashboardSummary summary={summary} />

      <div className="rounded-[2rem] border bg-card/50 backdrop-blur-xl p-8 shadow-sm">
        <CSVUploader />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="p-6 rounded-2xl bg-muted/30 border space-y-2">
          <h3 className="font-bold">Template Guidelines</h3>
          <p className="text-sm text-muted-foreground">
            Use columns: <strong>fullName, email, phone, password</strong>. Optional:{' '}
            <strong>planId</strong> (`standard` or `family`).
          </p>
          <p className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">
            Download CSV Template
          </p>
        </div>
        <div className="p-6 rounded-2xl bg-muted/30 border space-y-2">
          <h3 className="font-bold">Account Model</h3>
          <p className="text-sm text-muted-foreground">
            Each imported row creates an individual member account with its own active membership.
          </p>
        </div>
      </div>
    </div>
  );
}
