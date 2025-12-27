import { ClaimWizard } from '@/components/claims/claim-wizard';
import { auth } from '@/lib/auth';
import { hasActiveMembership } from '@interdomestik/domain-membership-billing/subscription';
import { Button } from '@interdomestik/ui';
import { ShieldAlert } from 'lucide-react';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `New Claim | Interdomestik`,
  };
}

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function NewClaimPage({ searchParams }: Props) {
  const t = await getTranslations('claims');
  const params = await searchParams;
  const preselectedCategory = params.category;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/auth/sign-in');
  }

  const hasAccess = await hasActiveMembership(session.user.id);

  if (!hasAccess) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center px-6">
            <h1 className="text-lg font-semibold">{t('new')}</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="flex flex-col items-center max-w-md mx-auto space-y-4">
            <div className="bg-orange-100 p-4 rounded-full dark:bg-orange-900/20">
              <ShieldAlert className="h-10 w-10 text-orange-600 dark:text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold">{t('gate.membership_required_title')}</h2>
            <p className="text-muted-foreground">{t('gate.membership_required_message')}</p>
            <Button asChild className="mt-4 bg-orange-600 hover:bg-orange-700 text-white">
              <Link href="/pricing">{t('gate.view_plans')}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-6">
          <h1 className="text-lg font-semibold">{t('new')}</h1>
        </div>
      </div>
      <div className="flex-1 p-6">
        <ClaimWizard initialCategory={preselectedCategory} />
      </div>
    </div>
  );
}
