import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  fields: vi.fn(),
  authorities: vi.fn(),
  correspondence: vi.fn(),
  summary: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture }));
vi.mock('@interdomestik/domain-claims/claims/green-card-case-fields', () => ({
  getGreenCardCaseFields: mocks.fields,
}));
vi.mock('@interdomestik/domain-claims/claims/case-authorities', () => ({
  listCaseAuthorities: mocks.authorities,
}));
vi.mock('@interdomestik/domain-claims/claims/correspondence-read', () => ({
  listClaimCorrespondence: mocks.correspondence,
  getClaimCorrespondenceSummary: mocks.summary,
}));

import { readBranchCorrespondenceSummary, readStaffCaseRegister } from './case-register-read';

describe('case register reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records an unexpected read failure and answers with a typed failure', async () => {
    const failure = new Error('read failed', {
      cause: { code: '57014', parameters: ['Synthetic insurance reference'] },
    });
    mocks.fields.mockResolvedValue({ ok: true, fields: {} });
    mocks.authorities.mockRejectedValue(failure);
    mocks.correspondence.mockResolvedValue({ ok: false, code: 'forbidden' });

    const [fields, authorities, correspondence] = await readStaffCaseRegister(null, null, 'c1');

    expect(fields).toEqual({ ok: true, fields: {} });
    expect(authorities).toEqual({ ok: false, code: 'INTERNAL_SERVER_ERROR' });
    expect(correspondence).toEqual({ ok: false, code: 'forbidden' });
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
      new Error('Unexpected case register read failure (SQLSTATE 57014)')
    );
    expect(mocks.capture.mock.calls[0]?.[0]).not.toHaveProperty('cause');
  });

  it('does not record a domain refusal of the branch summary', async () => {
    mocks.summary.mockResolvedValue({ ok: false, code: 'forbidden' });
    expect(await readBranchCorrespondenceSummary(null, null, 'c1')).toEqual({
      ok: false,
      code: 'forbidden',
    });
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
