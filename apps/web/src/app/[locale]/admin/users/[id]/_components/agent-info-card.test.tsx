import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentInfoCard } from './agent-info-card';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

describe('AgentInfoCard', () => {
  it('renders agent details', async () => {
    const mockAgent = {
      name: 'Agent Smith',
      email: 'agent@example.com',
      image: null,
    };

    const jsx = await AgentInfoCard({ agent: mockAgent });
    render(jsx);

    expect(screen.getByText('sections.agent')).toBeInTheDocument();
    expect(screen.getByText('Agent Smith')).toBeInTheDocument();
    expect(screen.getByText('agent@example.com')).toBeInTheDocument();
  });

  it('renders no agent label', async () => {
    const jsx = await AgentInfoCard({ agent: null });
    render(jsx);

    expect(screen.getByText('labels.no_agent')).toBeInTheDocument();
  });
});
