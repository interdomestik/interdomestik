import { SponsorLayout } from '@/features/sponsors/layout';

/** Staff sponsor pages also host the sponsor task queue and its client forms. */
export default async function StaffSponsorsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  return (
    <SponsorLayout locale={locale} namespaces={['sponsors', 'sponsorTasks']}>
      {children}
    </SponsorLayout>
  );
}
