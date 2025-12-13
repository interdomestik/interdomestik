import { Badge } from '@interdomestik/ui';

type ClaimStatus = 'draft' | 'submitted' | 'processing' | 'resolved' | 'rejected';

const statusConfig: Record<
  ClaimStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Draft', variant: 'outline' },
  submitted: { label: 'Submitted', variant: 'secondary' },
  processing: { label: 'Processing', variant: 'default' },
  resolved: { label: 'Resolved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

export function ClaimStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">Unknown</Badge>;

  const config = statusConfig[status as ClaimStatus];
  if (!config) return <Badge variant="outline">{status}</Badge>;

  return (
    <Badge variant={config.variant} className="capitalize">
      {config.label}
    </Badge>
  );
}
