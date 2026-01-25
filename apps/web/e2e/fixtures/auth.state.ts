import fs from 'node:fs/promises';
import path from 'node:path';
import { Role, Tenant } from './auth.project';

export function storageStateFile(role: Role, tenant: Tenant): string {
  // Keep legacy `admin_mk` file name for backwards-compat with existing state files.
  const filename = role === 'admin_mk' ? 'admin' : role;
  return path.join(__dirname, '..', '.auth', tenant, `${filename}.json`);
}

export async function storageStateExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
