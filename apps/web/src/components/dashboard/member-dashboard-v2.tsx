import type { MemberDashboardData } from '@interdomestik/domain-member';

type MemberDashboardV2Props = {
  data: MemberDashboardData;
  locale: string;
};

export function MemberDashboardV2({ data, locale }: MemberDashboardV2Props) {
  const latestClaims = data.claims.slice(0, 5);

  return (
    <div className="space-y-6 pb-10" data-testid="member-dashboard-ready" data-ui-v2="true">
      <section className="rounded-xl border bg-card p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Welcome, {data.member.name}</h1>
        <p className="text-sm text-muted-foreground">
          You can create a new claim or review your existing claims.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            data-testid="member-v2-create-claim"
            href={`/${locale}/member/claims/new`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create new claim
          </a>
          {data.claims.length > 0 ? (
            <a
              data-testid="member-v2-view-claims"
              href={`/${locale}/member/claims`}
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              View existing claims
            </a>
          ) : null}
        </div>
      </section>

      {latestClaims.length > 0 ? (
        <section
          className="rounded-xl border bg-card p-6 space-y-3"
          data-testid="member-v2-claims-list"
        >
          <h2 className="text-lg font-semibold">Recent claims</h2>
          <ul className="space-y-2">
            {latestClaims.map(claim => (
              <li key={claim.id} className="rounded-md border p-3">
                <a
                  href={`/${locale}/member/claims/${claim.id}`}
                  className="font-medium hover:underline"
                >
                  {claim.claimNumber ?? claim.id}
                </a>
                <p className="text-xs text-muted-foreground mt-1">Status: {claim.stageLabel}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
