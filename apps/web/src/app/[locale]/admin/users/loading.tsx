import { LocalizedPageSkeleton } from '@/components/ui/localized-page-skeleton';

export default function Loading(): React.JSX.Element {
  return <LocalizedPageSkeleton titleKey="admin.users_page.title" variant="list" titleSize="3xl" />;
}
