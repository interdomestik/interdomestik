import { ClaimWizard } from '@/components/claims/claim-wizard';
import { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `New Claim | Interdomestik`,
  };
}

export default function NewClaimPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-6">
          <h1 className="text-lg font-semibold">New Claim</h1>
        </div>
      </div>
      <div className="flex-1 p-6">
        <ClaimWizard />
      </div>
    </div>
  );
}
