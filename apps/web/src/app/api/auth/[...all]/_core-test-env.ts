import { vi } from 'vitest';

export function setProductionBuildEnv(idaHost?: string): void {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL_ENV', undefined);
  if (idaHost) vi.stubEnv('IDA_HOST', idaHost);
}
