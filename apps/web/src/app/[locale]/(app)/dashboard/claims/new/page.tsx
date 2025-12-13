import { ClaimForm } from '@/components/dashboard/claims/claim-form';

export default function NewClaimPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">New Claim</h2>
        </div>
      </div>

      <ClaimForm />
    </div>
  );
}
