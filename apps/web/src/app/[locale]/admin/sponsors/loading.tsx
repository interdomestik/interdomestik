'use client';

import { LocalizedPageSkeleton } from '@/components/ui/localized-page-skeleton';

export default function Loading(): React.JSX.Element {
  return <LocalizedPageSkeleton titleKey="sponsors.title" variant="list" />;
}
