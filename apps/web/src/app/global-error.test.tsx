import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import GlobalError from './global-error';

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('next-axiom', () => ({
  useLogger: () => ({ error: vi.fn() }),
}));

describe('GlobalError', () => {
  it('renders a stable body class for hydration', () => {
    const html = renderToString(<GlobalError error={new Error('boom')} reset={() => undefined} />);

    expect(html).toContain('class="antialiased"');
    expect(html).not.toContain('font-sans');
  });
});
