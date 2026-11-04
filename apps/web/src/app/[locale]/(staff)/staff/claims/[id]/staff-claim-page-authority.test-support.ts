import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { vi } from 'vitest';

export type StaffClaimPageRender = { session: unknown; authority: TenantAuthority | null };

/**
 * A stand-in for authorizeStaffClaimPage that mirrors the real producer for the session this
 * render's getSessionSafe returned, and records the authority it grants on `current`.
 */
export function mockStaffClaimPageAuthority(current: StaffClaimPageRender) {
  return {
    authorizeStaffClaimPage: vi.fn((user: { id: string; role?: string | null }) => {
      const session = current.session as { user?: { id?: string } } | null;
      if (session?.user?.id !== user.id) return Promise.resolve(null);
      let tenantId: string;
      try {
        tenantId = ensureTenantId(session as never);
      } catch (error) {
        if ((error as { name?: unknown }).name !== 'MissingTenantError') throw error;
        return Promise.resolve(null);
      }
      const authority = mintTestTenantAuthority(tenantId, {
        userId: user.id,
        role: user.role ?? null,
      });
      current.authority = authority;
      return Promise.resolve(authority);
    }),
  };
}
