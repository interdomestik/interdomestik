import { LocalizedPageSkeleton } from '@/components/ui/page-skeleton';

export default function StaffClaimsLoading(): React.JSX.Element {
  return (
    <LocalizedPageSkeleton
      titleKey="agent-claims.claims.claims_queue"
      variant="list"
      titleSize="3xl"
      testId="staff-claims-loading"
    />
  );
}
