import type { GroupDashboardSummary as GroupDashboardSummaryData } from '@/features/agent/import/server/get-group-dashboard-summary';

type SummaryCardProps = {
  eyebrow: string;
  title: string;
  value: number | string;
  detail: string;
};

function SummaryCard({ eyebrow, title, value, detail }: SummaryCardProps) {
  return (
    <div className="rounded-[1.75rem] border bg-card/70 p-5 shadow-sm">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-primary/70">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export function GroupDashboardSummary({ summary }: { summary: GroupDashboardSummaryData }) {
  return (
    <section className="space-y-4" data-testid="group-dashboard-summary">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-primary">Aggregate group access dashboard</p>
          <h2 className="text-2xl font-bold tracking-tight">Office portfolio overview</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            This view stays aggregate-only. No claim facts, notes, or documents are visible here.
          </p>
        </div>
        <div className="rounded-full border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
          Open cases: {summary.openClaimsCount}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <SummaryCard
          eyebrow="Activations"
          title="Activated members"
          value={summary.activatedMembersCount}
          detail="Active sponsored memberships currently assigned to this office portfolio."
        />
        <SummaryCard
          eyebrow="Usage"
          title="Annual usage rate"
          value={`${summary.usageRatePercent}%`}
          detail={`${summary.membersUsingBenefitsCount} of ${summary.activatedMembersCount} activated members have used member services.`}
        />
        <SummaryCard
          eyebrow="Cases"
          title="Open cases"
          value={summary.openClaimsCount}
          detail="Aggregate only. No member names or claim details are shown in this dashboard."
        />
        <SummaryCard
          eyebrow="SLA"
          title="SLA breaches"
          value={summary.sla.breachCount}
          detail="Submitted cases beyond the shared SLA breach threshold."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.5rem] border bg-muted/20 p-4">
          <p className="text-sm font-semibold">SLA running</p>
          <p className="mt-2 text-2xl font-bold">{summary.sla.runningCount}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Cases where the SLA is active and the next action belongs to staff.
          </p>
        </div>
        <div className="rounded-[1.5rem] border bg-muted/20 p-4">
          <p className="text-sm font-semibold">Waiting on member</p>
          <p className="mt-2 text-2xl font-bold">{summary.sla.incompleteCount}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Cases where the SLA has not started because member information is still missing.
          </p>
        </div>
        <div className="rounded-[1.5rem] border bg-muted/20 p-4">
          <p className="text-sm font-semibold">SLA not applicable</p>
          <p className="mt-2 text-2xl font-bold">{summary.sla.notApplicableCount}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Draft or otherwise non-SLA states kept only as aggregate counts.
          </p>
        </div>
      </div>
    </section>
  );
}
