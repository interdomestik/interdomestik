import { LocalizedPageSkeleton } from '@/components/ui/page-skeleton';

export default function AdminPortalLoading(): React.JSX.Element {
  return <LocalizedPageSkeleton titleKey="admin.dashboardOverview.title" variant="dashboard" />;
}
