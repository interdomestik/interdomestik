import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  submitBusinessMembershipLeadCore,
  type SubmitBusinessMembershipLeadInput,
} from './business-membership-lead';

const mockCaptureException = vi.fn();
const mockRateLimit = vi.fn();
const mockRunCommercialActionWithIdempotency = vi.fn();
const mockResolveTenantIdFromRequest = vi.fn();
const mockResolveBusinessLeadOwner = vi.fn();
const mockCreateLead = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: (...args: unknown[]) =>
    mockRunCommercialActionWithIdempotency(...args),
}));

vi.mock('@/lib/tenant/tenant-request', () => ({
  resolveTenantIdFromRequest: (...args: unknown[]) => mockResolveTenantIdFromRequest(...args),
}));

vi.mock('@/lib/business-leads/resolve-business-lead-owner', () => ({
  resolveBusinessLeadOwner: (...args: unknown[]) => mockResolveBusinessLeadOwner(...args),
}));

vi.mock('@interdomestik/domain-leads', () => ({
  createLead: (...args: unknown[]) => mockCreateLead(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const validInput: SubmitBusinessMembershipLeadInput = {
  firstName: 'Arben',
  lastName: 'Lila',
  companyName: 'Interdomestik Fleet',
  email: 'ops@interdomestik.test',
  phone: '+38344111222',
  teamSize: '11-25',
  notes: 'Needs fleet and property protection.',
  locale: 'sq',
};

describe('submitBusinessMembershipLeadCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommercialActionWithIdempotency.mockImplementation(async ({ execute }) => execute());
    mockResolveTenantIdFromRequest.mockResolvedValue('tenant_ks');
    mockResolveBusinessLeadOwner.mockResolvedValue({
      agentId: 'agent_system',
      branchId: 'branch_default',
    });
    mockRateLimit.mockResolvedValue({ limited: false });
    mockCreateLead.mockResolvedValue({ leadId: 'lead_123' });
  });

  it('creates a business lead with system ownership and serialized metadata', async () => {
    const result = await submitBusinessMembershipLeadCore({
      idempotencyKey: 'biz-1',
      requestHeaders: new Headers({
        referer:
          'https://interdomestik-web.vercel.app/sq/business-membership?utm_source=google&utm_campaign=fleet',
      }),
      data: validInput,
    });

    expect(result).toEqual({
      success: true,
      data: {
        leadId: 'lead_123',
      },
    });
    expect(mockResolveTenantIdFromRequest).toHaveBeenCalled();
    expect(mockResolveBusinessLeadOwner).toHaveBeenCalledWith('tenant_ks');
    expect(mockCreateLead).toHaveBeenCalledWith(
      {
        tenantId: 'tenant_ks',
        agentId: 'agent_system',
        branchId: 'branch_default',
      },
      expect.objectContaining({
        firstName: 'Arben',
        lastName: 'Lila',
        email: 'ops@interdomestik.test',
        phone: '+38344111222',
        notes: expect.stringContaining('"companyName":"Interdomestik Fleet"'),
      })
    );
    expect(mockCreateLead.mock.calls[0]?.[1]?.notes).toContain('"utmSource":"google"');
    expect(mockCreateLead.mock.calls[0]?.[1]?.notes).toContain('"utmCampaign":"fleet"');
    expect(mockRunCommercialActionWithIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'business-membership.submit',
        idempotencyKey: 'biz-1',
        requestFingerprint: validInput,
      })
    );
  });

  it('ignores malformed referer values instead of failing the action', async () => {
    const result = await submitBusinessMembershipLeadCore({
      requestHeaders: new Headers({
        referer: 'not-a-valid-url',
      }),
      data: validInput,
    });

    expect(result).toEqual({
      success: true,
      data: {
        leadId: 'lead_123',
      },
    });
    expect(mockCreateLead.mock.calls[0]?.[1]?.notes).toContain('"landingPage":"not-a-valid-url"');
    expect(mockCreateLead.mock.calls[0]?.[1]?.notes).toContain('"utmSource":null');
  });

  it('rejects invalid payloads with field issues', async () => {
    const result = await submitBusinessMembershipLeadCore({
      requestHeaders: new Headers(),
      data: {
        ...validInput,
        companyName: '',
      },
    });

    expect(result).toEqual({
      success: false,
      error: 'Validation failed',
      code: 'INVALID_PAYLOAD',
      issues: {
        companyName: 'Company name is required',
      },
    });
    expect(mockCreateLead).not.toHaveBeenCalled();
  });

  it('returns a rate-limit error when the action is throttled', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: true });

    const result = await submitBusinessMembershipLeadCore({
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    });
    expect(mockCreateLead).not.toHaveBeenCalled();
  });

  it('returns an unavailable error when no business lead owner is configured', async () => {
    mockResolveBusinessLeadOwner.mockResolvedValueOnce(null);

    const result = await submitBusinessMembershipLeadCore({
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: false,
      error: 'Business intake is temporarily unavailable. Please contact support directly.',
      code: 'OWNER_UNAVAILABLE',
    });
    expect(mockCreateLead).not.toHaveBeenCalled();
  });

  it('captures unexpected failures and returns an internal error', async () => {
    const failure = new Error('insert exploded');
    mockCreateLead.mockRejectedValueOnce(failure);

    const result = await submitBusinessMembershipLeadCore({
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: {
          action: 'submitBusinessMembershipLead',
          feature: 'business-membership',
        },
      })
    );
  });
});
