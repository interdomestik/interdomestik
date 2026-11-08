import { SponsorPage, type SponsorPageProps } from '@/features/sponsors/pages';

export default async function Page(props: SponsorPageProps): Promise<React.JSX.Element> {
  return SponsorPage({ ...props, area: 'staff' });
}
