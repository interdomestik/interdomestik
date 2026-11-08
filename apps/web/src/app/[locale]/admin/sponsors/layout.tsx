import { SponsorLayout } from '@/features/sponsors/layout';

export default function AdminSponsorsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <SponsorLayout namespaces={['sponsors', 'sponsorTasks']}>{children}</SponsorLayout>;
}
