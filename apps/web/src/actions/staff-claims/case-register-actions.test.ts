import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';
import { ROLES } from '@interdomestik/shared-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  audit: vi.fn(),
  capture: vi.fn(),
  recordAuthority: vi.fn(),
  revokeAuthority: vi.fn(),
  updateFields: vi.fn(),
  recordInbound: vi.fn(),
  recordOutbound: vi.fn(),
  followUp: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.audit }));
vi.mock('@sentry/nextjs', () => ({
  setTag: vi.fn(),
  setUser: vi.fn(),
  captureException: mocks.capture,
}));
vi.mock('@interdomestik/domain-claims/claims/case-authorities', async original => ({
  ...(await original<object>()),
  recordCaseAuthority: mocks.recordAuthority,
  revokeCaseAuthority: mocks.revokeAuthority,
}));
vi.mock('@interdomestik/domain-claims/claims/green-card-case-fields', async original => ({
  ...(await original<object>()),
  updateGreenCardCaseFields: mocks.updateFields,
}));
vi.mock('@interdomestik/domain-claims/claims/correspondence', async original => ({
  ...(await original<object>()),
  recordInboundCorrespondence: mocks.recordInbound,
  recordOutboundCorrespondence: mocks.recordOutbound,
  setCorrespondenceFollowUp: mocks.followUp,
}));

import {
  recordCaseAuthority,
  revokeCaseAuthority,
  updateGreenCardCaseFields,
} from './case-authorities';
import {
  recordInboundCorrespondence,
  recordOutboundCorrespondence,
  setCorrespondenceFollowUp,
} from './correspondence';

const claimId = 'claim-wp12';
const rowId = 'f3c4c7ff-e6bb-42f1-9a39-91816d4a3140';
const occurredAt = '2026-01-02T12:30:00.000Z';
const contact = {
  claimId,
  correlationId: rowId,
  partyKind: 'insurer',
  partyOrganisation: 'Synthetic insurer',
  channel: 'email',
  occurredAt,
  body: 'Contact summary',
};
const fields = {
  otherVehicleCountryCode: null,
  insuranceProofReference: null,
  outsideHandlingParty: null,
  coverageVerificationStatus: 'not_checked',
  caseFollowUpAt: null,
};

const actions = [
  {
    name: 'recordCaseAuthority',
    action: recordCaseAuthority,
    command: mocks.recordAuthority,
    input: {
      claimId,
      correlationId: rowId,
      kind: 'recovery_agreement',
      evidenceDocumentId: 'document-a',
      version: 'v1',
      grantedAt: occurredAt,
    },
    outcome: { authorityId: rowId },
    data: { authorityId: rowId },
  },
  {
    name: 'revokeCaseAuthority',
    action: revokeCaseAuthority,
    command: mocks.revokeAuthority,
    input: { claimId, authorityId: rowId },
    outcome: { authorityId: rowId },
    data: { authorityId: rowId },
  },
  {
    name: 'updateGreenCardCaseFields',
    action: updateGreenCardCaseFields,
    command: mocks.updateFields,
    input: { claimId, ...fields, expected: fields },
    outcome: { fields },
    data: fields,
  },
  {
    name: 'recordOutboundCorrespondence',
    action: recordOutboundCorrespondence,
    command: mocks.recordOutbound,
    input: { ...contact, recoveryAuthorityId: rowId, representationAuthorityId: rowId },
    outcome: { correspondenceId: rowId },
    data: { correspondenceId: rowId },
  },
  {
    name: 'recordInboundCorrespondence',
    action: recordInboundCorrespondence,
    command: mocks.recordInbound,
    input: contact,
    outcome: { correspondenceId: rowId },
    data: { correspondenceId: rowId },
  },
  {
    name: 'setCorrespondenceFollowUp',
    action: setCorrespondenceFollowUp,
    command: mocks.followUp,
    input: { claimId, correspondenceId: rowId, expectedFollowUpAt: null, followUpAt: occurredAt },
    outcome: { correspondenceId: rowId },
    data: { correspondenceId: rowId },
  },
];

function expectRefusal(name: string) {
  expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      action: 'action.refused',
      actorId: STAFF_A.id,
      entityId: `staffClaims.${name}`,
      metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'claim', id: claimId } },
    })
  );
}

describe.each(actions)('staffClaims.$name', ({ name, action, command, input, outcome, data }) => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
    mocks.audit.mockResolvedValue({ ok: true });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([ROLES.staff, ROLES.admin, ROLES.tenant_admin])(
    'forwards a %s session and bound authority',
    async role => {
      const context = authorizedSession({ ...STAFF_A, role });
      mocks.authorize.mockResolvedValue(context);
      command.mockResolvedValue({ ok: true, ...outcome });
      expect(await action(input)).toEqual({ success: true, data });
      expect(command).toHaveBeenCalledExactlyOnceWith(context.session, context.authority, input);
      expect(mocks.audit).not.toHaveBeenCalled();
    }
  );

  it('refuses a missing session before the command', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.authorize.mockResolvedValue(null);
    expect(await action(input)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(command).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(['member', 'agent', 'branch_manager', 'auditor', 'global_support', 'super_admin'])(
    'records a %s refusal before the command',
    async role => {
      mocks.authorize.mockResolvedValue(
        authorizedSession({ ...STAFF_A, role, branchId: 'branch-a' })
      );
      expect(await action(input)).toMatchObject({ success: false, code: 'FORBIDDEN' });
      expect(command).not.toHaveBeenCalled();
      expectRefusal(name);
    }
  );

  it.each([
    'tenantId',
    'actorId',
    'recordedByStaffId',
    'jurisdictionAttestedByUserId',
    'sharingAttestedAt',
  ])('rejects injected %s before the command', async field => {
    expect(await action({ ...input, [field]: 'injected' })).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(command).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('records and conceals a domain refusal', async () => {
    command.mockResolvedValue({ ok: false, code: 'forbidden' });
    expect(await action(input)).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(command).toHaveBeenCalledOnce();
    expectRefusal(name);
  });

  it.each(['invalid', 'invalid_state', 'authority_invalid', 'document_invalid', 'conflict'])(
    'preserves the domain code %s',
    async code => {
      command.mockResolvedValue({ ok: false, code });
      expect(await action(input)).toMatchObject({ success: false, code });
      expect(command).toHaveBeenCalledOnce();
      expect(mocks.audit).not.toHaveBeenCalled();
    }
  );
});

it('keeps contact names out of unexpected insert exception data', async () => {
  const contactName = 'Synthetic confidential name';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
  mocks.recordInbound.mockRejectedValue(new Error(`Query parameters: ${contactName}`));
  expect(
    await recordInboundCorrespondence({ ...contact, partyContactName: contactName })
  ).toMatchObject({ success: false, code: 'INTERNAL_SERVER_ERROR' });
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    new Error('Unexpected correspondence insert failure')
  );
  expect(mocks.capture.mock.calls[0]?.[0]).not.toHaveProperty('cause');
  vi.restoreAllMocks();
});
