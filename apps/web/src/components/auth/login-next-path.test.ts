import { describe, expect, it } from 'vitest';
import { resolveSafeNextPath } from './login-next-path';

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
