import { expect } from 'vitest';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { hoisted } from './_core.fixture';

// The lead lookup and conversion run under the webhook's tenant authority, the very token the
// event handlers receive, never a caller-built tenant literal.
export function expectLeadCall(
  mock: { mock: { calls: unknown[][] } },
  tenantId: string,
  args: Record<string, unknown>
) {
  const [authority, callArgs] = mock.mock.calls[0] as [
    Parameters<typeof readTenantAuthority>[0],
    unknown,
  ];
  expect(readTenantAuthority(authority).tenantId).toBe(tenantId);
  expect(callArgs).toEqual(args);
  const handlerParams = hoisted.handlePaddleEvent.mock.calls[0]![0] as { authority: unknown };
  expect(authority).toBe(handlerParams.authority);
}
