import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';

type HandoffClaim = {
  id: string;
  claimNumber: string | null;
  title: string | null;
  status: string | null;
};

/**
 * The claim a handoff refers to. A member draft keeps its label for context but gets no link:
 * staff cannot open a claim before the member submits it.
 */
export function SupportHandoffClaimLink({
  claim,
  fallbackLabel,
  noClaimLabel,
}: Readonly<{ claim: HandoffClaim | null; fallbackLabel: string; noClaimLabel: string }>) {
  if (!claim) return <div className="mt-1 text-xs text-muted-foreground">{noClaimLabel}</div>;
  const label = claim.claimNumber || claim.title || fallbackLabel;
  if (claim.status === 'draft') {
    return (
      <div
        className="mt-1 text-xs text-muted-foreground"
        data-testid="staff-support-handoff-claim-draft"
      >
        {label}
      </div>
    );
  }
  return (
    <Button asChild variant="link" size="sm" className="h-auto px-0 py-1 text-xs">
      <Link href={`/staff/claims/${claim.id}`} data-testid="staff-support-handoff-claim-link">
        {label}
      </Link>
    </Button>
  );
}
