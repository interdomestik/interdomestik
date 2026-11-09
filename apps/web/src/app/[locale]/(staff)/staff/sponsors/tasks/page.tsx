import { SponsorTasksPage } from '@/features/sponsor-tasks/tasks-page';
import type { ReactElement } from 'react';

export const instant = false;

export default async function StaffSponsorTasksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  return SponsorTasksPage({ area: 'staff', params });
}
