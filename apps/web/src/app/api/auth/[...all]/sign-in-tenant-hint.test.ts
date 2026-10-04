import { describe, expect, it } from 'vitest';

import {
  resolveSignInAdditionalTenantHint,
  resolveSignInTenantContext,
} from './sign-in-tenant-hint';

describe('resolveSignInAdditionalTenantHint', () => {
  it.each([
    [null],
    [undefined],
    ['not-an-object'],
    [[]],
    [{}],
    [{ email: 'member@example.test' }],
    [{ additionalData: undefined }],
    [{ additionalData: null }],
    [{ additionalData: {} }],
    [{ additionalData: { onboardingMode: 'deferred' } }],
    [{ additionalData: { tenantId: undefined } }],
  ])('reports an absent body hint for %o', body => {
    expect(resolveSignInAdditionalTenantHint(body)).toEqual({ kind: 'absent' });
  });

  it.each(['tenant_ks', ' tenant_mk ', 'tenant_al', 'pilot-mk'])(
    'accepts the explicit body tenant hint %o',
    raw => {
      expect(resolveSignInAdditionalTenantHint({ additionalData: { tenantId: raw } })).toEqual({
        kind: 'valid',
        tenantId: raw.trim(),
      });
    }
  );

  it('keeps a validated booking tenant hint as explicit context', () => {
    expect(
      resolveSignInAdditionalTenantHint({
        additionalData: { default_booking_tenant_id: 'tenant_mk' },
      })
    ).toEqual({ kind: 'valid', tenantId: 'tenant_mk' });
  });

  it.each([['additionalData-as-string'], [42], [true], [[{ tenantId: 'tenant_ks' }]]])(
    'rejects malformed additionalData %o separately from an absent hint',
    additionalData => {
      expect(resolveSignInAdditionalTenantHint({ additionalData })).toEqual({
        kind: 'invalid',
        reason: 'malformed_additional_data',
      });
    }
  );

  it.each([
    { tenantId: 'tenant_evil' },
    { tenantId: '' },
    { tenantId: '   ' },
    { tenantId: 'tenant_ks tenant_mk' },
    { tenantId: 42 },
    { tenantId: null },
    { tenantId: { id: 'tenant_ks' } },
    { default_booking_tenant_id: 'tenant_evil' },
  ])('rejects the unsupported hint value %o', additionalData => {
    expect(resolveSignInAdditionalTenantHint({ additionalData })).toEqual({
      kind: 'invalid',
      reason: 'unsupported_value',
    });
  });

  it('rejects two disagreeing body hints instead of coalescing them', () => {
    expect(
      resolveSignInAdditionalTenantHint({
        additionalData: { tenantId: 'tenant_ks', default_booking_tenant_id: 'tenant_mk' },
      })
    ).toEqual({ kind: 'invalid', reason: 'conflicting_body_hints' });
  });

  it('accepts two agreeing body hints', () => {
    expect(
      resolveSignInAdditionalTenantHint({
        additionalData: { tenantId: 'tenant_mk', default_booking_tenant_id: 'tenant_mk' },
      })
    ).toEqual({ kind: 'valid', tenantId: 'tenant_mk' });
  });
});

describe('resolveSignInTenantContext', () => {
  it('reports absent context when neither header nor body carries a hint', () => {
    expect(
      resolveSignInTenantContext(new Headers({ host: 'www.interdomestik.com' }), {
        email: 'member@example.test',
      })
    ).toEqual({ kind: 'absent' });
  });

  it('never treats a tenant cookie as explicit context', () => {
    expect(
      resolveSignInTenantContext(
        new Headers({ host: 'ida.localhost:3000', cookie: 'tenantId=tenant_ks; other=1' }),
        { email: 'member@example.test' }
      )
    ).toEqual({ kind: 'absent' });
  });

  it('treats an empty header value as absent rather than invalid', () => {
    expect(resolveSignInTenantContext(new Headers({ 'x-tenant-id': '   ' }))).toEqual({
      kind: 'absent',
    });
  });

  it('accepts a valid header hint', () => {
    expect(resolveSignInTenantContext(new Headers({ 'x-tenant-id': 'tenant_mk' }))).toEqual({
      kind: 'valid',
      tenantId: 'tenant_mk',
    });
  });

  it.each(['tenant_evil', 'tenant_mk, tenant_ks', 'tenant_mk tenant_ks'])(
    'rejects the invalid non-empty header value %o',
    value => {
      expect(resolveSignInTenantContext(new Headers({ 'x-tenant-id': value }))).toEqual({
        kind: 'invalid',
        reason: 'invalid_header',
      });
    }
  );

  it('rejects an invalid header even when the body hint is valid', () => {
    expect(
      resolveSignInTenantContext(new Headers({ 'x-tenant-id': 'tenant_evil' }), {
        additionalData: { tenantId: 'tenant_mk' },
      })
    ).toEqual({ kind: 'invalid', reason: 'invalid_header' });
  });

  it('rejects a header/body conflict', () => {
    expect(
      resolveSignInTenantContext(new Headers({ 'x-tenant-id': 'tenant_mk' }), {
        additionalData: { tenantId: 'tenant_ks' },
      })
    ).toEqual({ kind: 'invalid', reason: 'header_body_conflict' });
  });

  it('keeps header precedence when header and body agree', () => {
    expect(
      resolveSignInTenantContext(new Headers({ 'x-tenant-id': 'tenant_mk' }), {
        additionalData: { tenantId: 'tenant_mk' },
      })
    ).toEqual({ kind: 'valid', tenantId: 'tenant_mk' });
  });

  it('surfaces a malformed body hint when no header is present', () => {
    expect(resolveSignInTenantContext(new Headers(), { additionalData: 'tenant_mk' })).toEqual({
      kind: 'invalid',
      reason: 'malformed_additional_data',
    });
  });
});
