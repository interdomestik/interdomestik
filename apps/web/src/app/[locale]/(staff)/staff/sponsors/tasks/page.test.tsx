import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

const load = vi.hoisted(() => vi.fn());
vi.mock('@/features/sponsor-tasks/tasks.core', () => ({ loadSponsorTasks: load }));
vi.mock('@/features/sponsor-tasks/task-list', () => ({
  SponsorTaskList: () => <div>task list</div>,
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('staff sponsor tasks page', () => {
  it('renders ready content after an authorized read', async () => {
    load.mockResolvedValue({ ok: true, tasks: [] });
    render(await Page({ params: Promise.resolve({ locale: 'en' }) }));
    expect(screen.getByTestId('staff-sponsor-tasks-page-ready')).toHaveTextContent('task list');
  });
  it.each(['forbidden', 'error'])('shows %s without task data', async error => {
    load.mockResolvedValue({ ok: false, error });
    render(await Page({ params: Promise.resolve({ locale: 'en' }) }));
    expect(screen.getByRole('alert')).toHaveTextContent(`errors.${error}`);
    expect(screen.queryByText('task list')).not.toBeInTheDocument();
    if (error === 'error')
      expect(screen.getByRole('link')).toHaveAttribute('href', '/en/staff/sponsors/tasks');
    else expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
