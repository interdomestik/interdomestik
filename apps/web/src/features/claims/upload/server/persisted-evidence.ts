import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

type EvidenceTenant = { authority: TenantAuthority; tenantId: string };

export function assertEvidenceTenantAuthority(params: EvidenceTenant): void {
  if (readTenantAuthority(params.authority).tenantId !== params.tenantId) {
    throw new Error('Evidence tenant authority mismatch');
  }
}
