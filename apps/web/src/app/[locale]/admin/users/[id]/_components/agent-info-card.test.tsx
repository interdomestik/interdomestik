import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentInfoCard } from './agent-info-card';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

describe('AgentInfoCard', () => {
  it('wraps long assigned-agent names and email addresses without removing text', async () => {
    const name = 'Agent'.repeat(50);
    const email = `${'agent'.repeat(50)}@example.com`;
    render(await AgentInfoCard({ locale: 'de', agent: { name, email, image: null } }));
    expect(screen.getByText(name).parentElement).toHaveClass('min-w-0', '[overflow-wrap:anywhere]');
    expect(screen.getByText(email)).toHaveTextContent(email);
  });

  it('renders agent details', async () => {
    const mockAgent = {
      name: 'Agent Smith',
      email: 'agent@example.com',
      image: null,
    };

    const jsx = await AgentInfoCard({ locale: 'en', agent: mockAgent });
    render(jsx);

    expect(screen.getByText('sections.agent')).toBeInTheDocument();
    expect(screen.getByText('Agent Smith')).toBeInTheDocument();
    expect(screen.getByText('agent@example.com')).toBeInTheDocument();
  });

  it('renders no agent label', async () => {
    const jsx = await AgentInfoCard({ locale: 'en', agent: null });
    render(jsx);

    expect(screen.getByText('labels.no_agent')).toBeInTheDocument();
  });
});
