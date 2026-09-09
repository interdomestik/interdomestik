import { RequestBoundary } from '@/components/shell/request-boundary';
import Entry from './_layout.entry';

export default function Layout(props: Parameters<typeof Entry>[0]) {
  return <RequestBoundary render={() => <Entry {...props} />} />;
}
