import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { AgentStatsCards } from '../agent-stats-cards';

// Mock next-intl
vi.mock('next-intl', async () => {
  const actual = await vi.importActual('next-intl');
  return {
    ...actual,
    useTranslations: (namespace: string) => (key: string) => {
      if (namespace === 'agent.stats') {
        const translations: Record<string, string> = {
          total: 'Total Claims',
          new: 'New',
          verification: 'Verification',
          closed: 'Closed',
        };
        return translations[key] || key;
      }
      return key;
    },
  };
});

describe('AgentStatsCards', () => {
  const mockStats = {
    total: 100,
    new: 10,
    inProgress: 20,
    completed: 70,
  };

  it('renders all stat cards with correct values', () => {
    render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <AgentStatsCards stats={mockStats} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Total Claims')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    expect(screen.getByText('Verification')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
  });
});
