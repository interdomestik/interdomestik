import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { formatPilotDate } from '@/lib/utils/date';
import { AdminPageHeader } from './admin-page-header';

vi.mock('next-intl', () => ({ useLocale: () => 'sr' }));

describe('AdminPageHeader date', () => {
  it('leaves the clock out of the server render so hydration cannot straddle midnight', () => {
    const html = renderToString(<AdminPageHeader title="Pregled" subtitle="Subtitle" />);
    expect(html).toContain('Subtitle');
    expect(html).not.toContain('•');
  });

  it('shows the pilot-formatted date on the client', () => {
    render(<AdminPageHeader title="Pregled" subtitle="Subtitle" />);
    const today = formatPilotDate(new Date(), 'sr', '');
    expect(screen.getByText(`${today} •`, { exact: false })).toHaveTextContent(
      `${today} • Subtitle`
    );
  });
});
