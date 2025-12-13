import { ClaimWizard } from '@/components/dashboard/claims/claim-wizard';

export default function NewClaimPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">File a New Claim</h2>
          <p className="text-muted-foreground mt-1">
            Follow the steps below to submit your consumer protection claim
          </p>
        </div>
      </div>

      <ClaimWizard />
    </div>
  );
}
