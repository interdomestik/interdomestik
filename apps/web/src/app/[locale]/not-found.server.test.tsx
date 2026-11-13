import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import LocaleNotFound from './not-found';

// Stands in for the client reference: in a streamed Flight/SSR denial the client copy may not be
// rendered yet, so the server boundary alone must carry every contractual marker.
vi.mock('./locale-not-found-copy', () => ({ LocaleNotFoundCopy: () => null }));

describe('locale not-found server boundary (qa3 #67)', () => {
  it('renders the not-found markers without the client copy or an intl provider', () => {
    const html = renderToStaticMarkup(LocaleNotFound());
    expect(html).toContain('data-testid="not-found-page"');
    expect(html).toContain('data-not-found-scope="locale-not-found"');
    expect(html).toContain('Interdomestik · 404');
  });

  it('is a synchronous server component, not a client reference', () => {
    const element = LocaleNotFound();
    expect(typeof LocaleNotFound).toBe('function');
    expect(element.props.scope).toBe('locale');
  });
});
