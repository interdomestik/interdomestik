'use server';

import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export async function adminUpdateSettings(data: {
  appName: string;
  supportEmail: string;
  autoAssign: boolean;
  defaultExpiry: number;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  // NOTE: This is a stub for future global settings table
  // For now we just log and revalidate to simulate success
  console.log('Updating global settings:', data);

  // Real implementation would involve db.update(settingsTable)...

  revalidatePath('/admin/settings');
  return { success: true };
}
