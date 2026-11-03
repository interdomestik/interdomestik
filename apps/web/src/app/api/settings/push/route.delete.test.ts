import {
  hoistedMocks,
  mockDeleteChain,
  mockWithTenantContext,
  validPushBody,
} from './route.test-support';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from './route';

const validDeleteBody = { endpoint: validPushBody.endpoint };
const sameEndpointOwner = { tenantId: 'tenant_mk', userId: 'user-123' };
function authenticatedSession(tenantId: string | null = 'tenant_mk') {
  return { user: { id: 'user-123', tenantId } };
}

function deleteRequest(body: unknown = validDeleteBody): Request {
  return new Request('http://localhost:3000/api/settings/push', {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function expectJsonResponse(
  response: Response,
  status: number,
  body: Record<string, unknown>
) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
}

describe('DELETE /api/settings/push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteChain.where.mockResolvedValue(undefined);
  });

  it('returns 401 if user is not authenticated', async () => {
    hoistedMocks.getSession.mockResolvedValue(null);

    const response = await DELETE(deleteRequest());
    await expectJsonResponse(response, 401, { error: 'Unauthorized' });
  });

  it('returns 401 when tenant identity is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession(null));

    const response = await DELETE(deleteRequest());

    await expectJsonResponse(response, 401, { error: 'Missing tenant identity' });
    expect(mockDeleteChain.where).not.toHaveBeenCalled();
    expect(hoistedMocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest('invalid json'));
    await expectJsonResponse(response, 400, { error: 'Invalid JSON' });
  });

  it('returns 400 when endpoint is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest({}));
    await expectJsonResponse(response, 400, { error: 'Invalid subscription' });
  });

  it('deletes subscription by endpoint', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest());

    await expectJsonResponse(response, 200, { success: true });
    expect(readTenantAuthority(mockWithTenantContext.mock.calls[0][0]).tenantId).toBe('tenant_mk');
    expect(mockDeleteChain.where).toHaveBeenCalledWith({
      type: 'and',
      conditions: [
        { type: 'eq', field: 'endpoint', value: validPushBody.endpoint },
        { type: 'eq', field: 'tenant_id', value: sameEndpointOwner.tenantId },
        { type: 'eq', field: 'user_id', value: sameEndpointOwner.userId },
      ],
    });
  });
});
