import { RequestBoundary } from '@/components/shell/request-boundary';
import Entry from './_core.entry';

export default function Layout(props: Readonly<Parameters<typeof Entry>[0]>) {
  return <RequestBoundary render={() => <Entry {...props} />} />;
}
