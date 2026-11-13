import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeaderboardCard } from './leaderboard-card';

const state = vi.hoisted(() => ({ locale: 'sq' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => state.locale,
}));
vi.mock('@/actions/leaderboard', () => ({ getAgentLeaderboard: vi.fn() }));

function renderBoard(totalEarned: number): void {
  render(
    <LeaderboardCard
      initialResult={{
        success: true,
        data: {
          period: 'month',
          currentUserRank: 1,
          topAgents: [
            {
              rank: 1,
              agentId: 'agent-1',
              agentName: 'Arta Agent',
              agentImage: null,
              totalEarned,
              dealCount: 2,
              isCurrentUser: true,
            },
          ],
        },
      }}
    />
  );
}

describe('LeaderboardCard earnings (qa3 #24)', () => {
  it.each([
    ['en', /^€1,250\.00$/],
    ['sq', /^1\.250,00\s€$/],
    ['sr', /^1\.250,00\s€$/],
    ['mk', /^1\.250,00\s€$/],
    ['de', /^1\.250,00\s€$/],
  ])('formats agent earnings in the %s app euro style', (locale, expected) => {
    state.locale = locale;
    renderBoard(1250);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('never prefixes a raw euro sign to an en-US number outside en', () => {
    state.locale = 'sq';
    renderBoard(50);
    expect(screen.queryByText('€50.00')).toBeNull();
    expect(screen.getByText(/^50,00\s€$/)).toBeInTheDocument();
  });
});
