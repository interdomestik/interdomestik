import { RequestBoundary } from '@/components/shell/request-boundary';
import Entry from './_core.entry';

export default function Layout(props: Parameters<typeof Entry>[0]) {
  return (
    <RequestBoundary>
      <Entry {...props} />
    </RequestBoundary>
  );
}
