'use server';

import { revalidatePath } from 'next/cache';

import { getActionContext } from './admin-settings/context';
import { adminUpdateSettingsCore } from './admin-settings/update';

export async function adminUpdateSettings(data: {
  appName: string;
  supportEmail: string;
  autoAssign: boolean;
  defaultExpiry: number;
}) {
  const { session } = await getActionContext();
  const result = await adminUpdateSettingsCore({ session, data });
  revalidatePath('/admin/settings');
  return result;
}
