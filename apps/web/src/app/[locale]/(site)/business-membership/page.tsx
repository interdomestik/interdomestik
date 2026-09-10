import { connection } from 'next/server';

import { BusinessLeadKeyProvider } from '@/components/pricing/business-lead-form';

import Entry from './_core.entry';

export { generateMetadata, generateStaticParams, generateViewport } from './_core.entry';

export const instant = false;

export default async function BusinessMembershipPage(props: Parameters<typeof Entry>[0]) {
  await connection();
  return (
    <BusinessLeadKeyProvider value={crypto.randomUUID()}>
      <Entry {...props} />
    </BusinessLeadKeyProvider>
  );
}
