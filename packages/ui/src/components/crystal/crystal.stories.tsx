import type { Meta, StoryObj } from '@storybook/react';
import {
  MatteAnchorCard,
  RefractiveGlassPanel,
  Stepper,
  Timeline,
  UnifiedPortalShell,
} from '../../index';

const meta = {
  title: 'Crystal/Unified Portal Primitives',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const CaseActionsTimeline: Story = {
  render: () => (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <span className="sr-only">Responsive proof: 320 / 768 / 1440</span>
      <UnifiedPortalShell
        caseLabel="Case"
        caseRegion={
          <MatteAnchorCard
            href="#case"
            eyebrow="Case"
            label="Travel assistance"
            description="Open the current case"
          />
        }
        actionsLabel="Actions"
        actionsRegion={
          <RefractiveGlassPanel>
            <Stepper
              ariaLabel="Actions"
              currentStepId="apply"
              steps={[
                { id: 'check', label: 'Check', state: 'completed', stateLabel: 'Completed' },
                { id: 'apply', label: 'Apply', state: 'future', stateLabel: 'Current' },
                { id: 'track', label: 'Follow up', state: 'future', stateLabel: 'Upcoming' },
              ]}
            />
          </RefractiveGlassPanel>
        }
        timelineLabel="Timeline"
        timelineRegion={
          <RefractiveGlassPanel>
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
        }
      />
    </main>
  ),
};
