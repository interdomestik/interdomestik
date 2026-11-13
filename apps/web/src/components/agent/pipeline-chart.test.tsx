import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en/agent.json';
import sq from '@/messages/sq/agent.json';
import mk from '@/messages/mk/agent.json';
import sr from '@/messages/sr/agent.json';
import de from '@/messages/de/agent.json';
import enCommon from '@/messages/en/common.json';
import sqCommon from '@/messages/sq/common.json';
import mkCommon from '@/messages/mk/common.json';
import srCommon from '@/messages/sr/common.json';
import deCommon from '@/messages/de/common.json';
import { PipelineChart } from './pipeline-chart';

vi.unmock('next-intl');
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, minWidth }: React.PropsWithChildren<{ minWidth: number }>) => (
    <div data-testid="pipeline-chart" data-min-width={minWidth}>
      {children}
    </div>
  ),
  BarChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Bar: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe('pipeline presentation', () => {
  it.each([
    { locale: 'en', messages: { ...en, ...enCommon } },
    { locale: 'sq', messages: { ...sq, ...sqCommon } },
    { locale: 'mk', messages: { ...mk, ...mkCommon } },
    { locale: 'sr', messages: { ...sr, ...srCommon } },
    { locale: 'de', messages: { ...de, ...deCommon } },
  ])('shows the zero-data state in $locale', ({ locale, messages }) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PipelineChart data={{ newLeads: 0, contactedLeads: 0, wonDeals: 0 }} />
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('agent-pipeline-empty')).toHaveTextContent(
      messages.common.no_results
    );
    expect(screen.queryByTestId('pipeline-chart')).not.toBeInTheDocument();
  });

  it.each([
    { newLeads: 1, contactedLeads: 0, wonDeals: 0 },
    { newLeads: 0, contactedLeads: 1, wonDeals: 0 },
    { newLeads: 0, contactedLeads: 0, wonDeals: 1 },
  ])('keeps the chart whenever a stage has data: %o', data => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <PipelineChart data={data} />
      </NextIntlClientProvider>
    );
    expect(screen.queryByTestId('agent-pipeline-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('pipeline-chart')).toHaveAttribute('data-min-width', '0');
    expect(screen.getByTestId('pipeline-chart').parentElement).toHaveClass('w-full', 'min-w-0');
  });
});
