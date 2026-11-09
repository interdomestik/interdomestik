import { LocalizedPageSkeleton } from '@/components/ui/page-skeleton';

export default function Loading(): React.JSX.Element {
  return <LocalizedPageSkeleton titleKey="admin.branches.title" variant="list" titleSize="3xl" />;
}
