import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import GlobalError from './global-error';

vi.mock('@interdomestik/ui', () => ({
  Button: (props: React.ComponentProps<'button'>) => <button {...props} />,
}));

vi.mock('next-axiom', () => ({
  useLogger: () => ({ error: vi.fn() }),
}));

describe('GlobalError', () => {
  it.each([
    ['sq', 'Faqja nuk mund të ngarkohej', 'Provo përsëri'],
    ['en', 'This page could not be loaded', 'Try again'],
    ['sr', 'Stranica nije mogla da se učita', 'Pokušajte ponovo'],
    ['mk', 'Страницата не можеше да се вчита', 'Обиди се повторно'],
    ['de', 'Diese Seite konnte nicht geladen werden', 'Erneut versuchen'],
  ])('localizes %s from the browser path without providers', (locale, title, retryLabel) => {
    window.history.replaceState(null, '', `/${locale}/staff/claims`);
    const retry = vi.fn();
    const reset = vi.fn();
    render(
      <GlobalError error={new Error('private provider detail')} reset={reset} retry={retry} />
    );
    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    expect(screen.queryByText('private provider detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: retryLabel }));
    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it('renders a stable body class for hydration', () => {
    const html = renderToString(<GlobalError error={new Error('boom')} reset={() => undefined} />);

    expect(html).toContain('class="antialiased"');
    expect(html).not.toContain('font-sans');
  });
});
