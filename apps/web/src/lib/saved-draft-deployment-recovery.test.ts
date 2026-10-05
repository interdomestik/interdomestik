import { describe, expect, it } from 'vitest';
import { isOutdatedServerAction, savedDraftRecoveryHref } from './saved-draft-deployment-recovery';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';

const id = '63ffc31e-8c64-4758-995a-c57f40de7568';
describe('saved draft deployment recovery', () => {
  it('recognizes the installed Next action-not-found protocol, not general failures', () => {
    const error = Object.defineProperty(
      new UnrecognizedActionError('Server Action was not found'),
      '__NEXT_ERROR_CODE',
      { value: 'E715' }
    );
    expect(isOutdatedServerAction(error)).toBe(true);
    for (const candidate of [
      new Error('404'),
      new Error('Failed to find Server Action'),
      new UnrecognizedActionError('unclassified'),
      { name: 'UnrecognizedActionError', __NEXT_ERROR_CODE: 'E715' },
      null,
    ]) {
      expect(isOutdatedServerAction(candidate)).toBe(false);
    }
  });
  it.each(['en', 'sq', 'mk', 'sr'])('returns only the canonical %s draft review', locale => {
    expect(savedDraftRecoveryHref(locale, id)).toBe(
      `/${locale}/member/claims/new?mode=drafts#draft=${id}`
    );
  });
  it.each([
    ['//evil.example', id],
    ['en', '//evil.example'],
    ['en', `${id}&next=/admin`],
    ['en', 'malformed'],
    ['en/admin', id],
  ])('rejects malformed targets %s %s', (locale, value) => {
    expect(savedDraftRecoveryHref(locale, value)).toBeNull();
  });
  it('preserves admitted task context, leaving fresh confirmation with the existing page', () => {
    const href = savedDraftRecoveryHref('en', id, {
      source: 'diaspora-green-card',
      country: 'IT',
      incidentLocation: 'abroad',
    });
    const url = new URL(href!, 'https://internal.invalid');
    expect(url.searchParams.get('mode')).toBe('drafts');
    expect(url.searchParams.get('category')).toBe('vehicle');
    expect(url.searchParams.get('country')).toBe('IT');
    expect(url.hash).toBe(`#draft=${id}`);
    expect(url.searchParams.has('confirmed')).toBe(false);
    expect(
      savedDraftRecoveryHref('en', id, {
        source: 'external',
        country: '//evil',
        incidentLocation: 'abroad',
      } as never)
    ).toBe(savedDraftRecoveryHref('en', id));
  });
});
