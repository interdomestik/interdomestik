import { LocalizedPageSkeleton } from '@/components/ui/localized-page-skeleton';

export default function Loading(): React.JSX.Element {
  return (
    <LocalizedPageSkeleton
      titleKey="agent-members.members.page.title"
      variant="list"
      titleSize="3xl"
    />
  );
}
