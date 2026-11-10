import { LocalizedPageSkeleton } from '@/components/ui/localized-page-skeleton';

export default function Loading(): React.JSX.Element {
  return <LocalizedPageSkeleton titleKey="admin.claims_page.title" variant="list" />;
}
