import { SponsorLayout } from '@/features/sponsors/layout';

/** Staff sponsor pages also host the sponsor task queue and its client forms. */
export default function StaffSponsorsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <SponsorLayout namespaces={['sponsors', 'sponsorTasks']}>{children}</SponsorLayout>;
}
