import type { Meta, StoryObj } from '@storybook/react';
import { MatteAnchorCard, RefractiveGlassPanel, Stepper, Timeline } from '../../index';

const meta = {
  title: 'Crystal/Unified Portal Primitives',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const CaseActionsTimeline: Story = {
  render: () => (
    <main className="mx-auto grid max-w-5xl gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:p-6">
      <span className="sr-only">Responsive proof: 320 / 768 / 1440</span>
      <MatteAnchorCard
        href="#case"
        eyebrow="Case"
        label="Travel assistance"
        description="Open the current case"
      />
      <RefractiveGlassPanel role="region" aria-label="Actions and timeline" className="space-y-6">
        <Stepper
          ariaLabel="Actions"
          steps={[
            { id: 'check', label: 'Check', state: 'completed', stateLabel: 'Completed' },
            { id: 'apply', label: 'Apply', state: 'current', stateLabel: 'Current' },
            { id: 'track', label: 'Follow up', state: 'future', stateLabel: 'Upcoming' },
          ]}
        />
        <Timeline
          ariaLabel="Timeline"
          emptyLabel="No activity yet"
          items={[
            {
              id: 'opened',
              title: 'Case opened',
              dateTime: '2026-08-26',
              dateLabel: '26 August',
              stateLabel: 'Completed',
            },
          ]}
        />
      </RefractiveGlassPanel>
    </main>
  ),
};
