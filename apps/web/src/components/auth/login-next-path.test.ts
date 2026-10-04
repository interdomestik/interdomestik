import { describe, expect, it } from 'vitest';
import { resolveSafeNextPath, sanitizeInternalContinuationPath } from './login-next-path';

const hash = '#draft=63ffc31e-8c64-4758-995a-c57f40de7568';
describe('post-authentication saved-draft target', () => {
  it.each(['en', 'sq', 'mk', 'sr'])('recovers the exact canonical %s member path', locale => {
    expect(resolveSafeNextPath(null, 'member', locale, hash)).toBe(
      `/${locale}/member/claims/new?mode=drafts${hash}`
    );
  });
  it.each(['staff', 'admin', 'agent', 'unknown'])('does not grant %s a member target', role => {
    expect(resolveSafeNextPath(null, role, 'en', hash)).toBeNull();
  });
  it('preserves explicit next precedence, including an invalid next', () => {
    expect(resolveSafeNextPath('/en/member/claims', 'user', 'en', hash)).toBe('/en/member/claims');
    expect(resolveSafeNextPath('//foreign.invalid', 'user', 'en', hash)).toBeNull();
    expect(resolveSafeNextPath('/en/admin/overview', 'user', 'en', hash)).toBeNull();
  });
  it.each(['', '#draft=bad', `${hash}&next=//foreign.invalid`])(
    'rejects %s without fallback',
    value => {
      expect(resolveSafeNextPath(null, 'user', 'en', value)).toBeNull();
    }
  );
});

describe('role-scoped continuation safety', () => {
  it.each([
    ['/sq/member/../admin', 'member', 'sq'],
    ['/sq/member/../../en/admin/overview', 'member', 'sq'],
    ['/en/member/..%2F..%2Fadmin/overview', 'user', 'en'],
    ['/en/member%2F..%2Fadmin', 'user', 'en'],
    ['/en/member/./../admin', 'user', 'en'],
  ])('rejects the traversal escape %s for a %s', (candidate, role, locale) => {
    expect(resolveSafeNextPath(candidate, role, locale)).toBeNull();
  });

  it.each([
    'https://foreign.invalid/en/member',
    '//foreign.invalid/en/member',
    '/\\foreign.invalid/en/member',
    'en/member',
    '',
    '/en/member\\..\\admin',
    '/en/member\u0000/claims',
    '/en/member\nSet-Cookie: x=1',
    '/en/member /claims',
  ])('rejects the malformed or external candidate %o', candidate => {
    expect(resolveSafeNextPath(candidate, 'member', 'en')).toBeNull();
  });

  it.each([
    ['/en/staff/claims', 'member'],
    ['/en/admin/overview', 'agent'],
    ['/en/member', 'staff'],
    ['/en/agent', 'admin'],
    ['/sq/member', 'member'],
  ])('rejects the cross-role or cross-locale target %s for %s', (candidate, role) => {
    expect(resolveSafeNextPath(candidate, role, 'en')).toBeNull();
  });

  it.each(['unknown', 'super_user', ''])('rejects the unsupported role %o', role => {
    expect(resolveSafeNextPath('/en/member', role, 'en')).toBeNull();
  });

  it.each([
    ['member', '/en/member'],
    ['user', '/en/member/claims/new?mode=drafts'],
    ['agent', '/en/agent/members?page=2'],
    ['staff', '/en/staff/claims'],
    ['admin', '/en/admin/overview'],
    ['super_admin', '/en/admin/overview?tab=audit'],
  ])('honors the valid %s continuation %s', (role, candidate) => {
    expect(resolveSafeNextPath(candidate, role, 'en')).toBe(candidate);
  });

  it('preserves a supported query and opaque draft fragment continuation', () => {
    expect(resolveSafeNextPath(`/en/member/claims/new?mode=drafts${hash}`, 'member', 'en')).toBe(
      `/en/member/claims/new?mode=drafts${hash}`
    );
  });

  it('normalizes a harmless same-surface traversal', () => {
    expect(resolveSafeNextPath('/en/member/claims/../claims/new', 'member', 'en')).toBe(
      '/en/member/claims/new'
    );
  });
});

describe('sanitizeInternalContinuationPath', () => {
  it('returns the normalized pathname and preserved continuation', () => {
    expect(sanitizeInternalContinuationPath('/en/login?plan=family#draft=1')).toEqual({
      pathname: '/en/login',
      target: '/en/login?plan=family#draft=1',
    });
  });

  it.each([null, undefined])('treats %o as unusable', candidate => {
    expect(sanitizeInternalContinuationPath(candidate)).toBeNull();
  });

  it.each([
    '//evil.example',
    'https://evil.example/en/login',
    'en/login',
    '/en/login/..%2F..%2Fadmin',
    '/\\evil.example/en/login',
    '/en/login\u0001',
  ])('rejects %o', candidate => {
    expect(sanitizeInternalContinuationPath(candidate)).toBeNull();
  });

  it('normalizes traversal rather than trusting the raw prefix', () => {
    expect(sanitizeInternalContinuationPath('/sq/login/../../en/login')).toEqual({
      pathname: '/en/login',
      target: '/en/login',
    });
  });
});
