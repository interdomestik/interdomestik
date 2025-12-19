import { ClaimWizard } from '@/components/claims/claim-wizard';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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
