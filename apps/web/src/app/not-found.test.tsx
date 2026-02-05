import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RootNotFound from './not-found';

describe('RootNotFound', () => {
  it('renders a stable body class for hydration', () => {
    const html = renderToString(<RootNotFound />);

    expect(html).toContain('class="antialiased"');
  });
});
