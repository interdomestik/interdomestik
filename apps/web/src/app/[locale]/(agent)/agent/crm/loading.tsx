import { LocalizedPageSkeleton } from '@/components/ui/page-skeleton';

export default function Loading(): React.JSX.Element {
  return <LocalizedPageSkeleton titleKey="agent.crm" variant="dashboard" titleSize="3xl" />;
}
