import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SponsorTasksPage } from './tasks-page';

const load = vi.hoisted(() => vi.fn());
vi.mock('./tasks.core', () => ({ loadSponsorTasks: load }));
vi.mock('./task-list', () => ({
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

describe.each(['staff', 'admin'] as const)('%s sponsor tasks page', area => {
  const Page = (props: {
    params: Promise<{ locale: string }>;
  }): ReturnType<typeof SponsorTasksPage> => SponsorTasksPage({ area, ...props });
  it('renders ready content after an authorized read', async () => {
    load.mockResolvedValue({ ok: true, tasks: [] });
    render(await Page({ params: Promise.resolve({ locale: 'en' }) }));
    expect(screen.getByTestId(`${area}-sponsor-tasks-page-ready`)).toHaveTextContent('task list');
  });
  it.each(['forbidden', 'error'])('shows %s without task data', async error => {
    load.mockResolvedValue({ ok: false, error });
    render(await Page({ params: Promise.resolve({ locale: 'en' }) }));
    expect(screen.getByRole('alert')).toHaveTextContent(`errors.${error}`);
    expect(screen.queryByText('task list')).not.toBeInTheDocument();
    if (error === 'error')
      expect(screen.getByRole('link')).toHaveAttribute('href', `/en/${area}/sponsors/tasks`);
    else expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
