import { WorkspaceNavDTO } from '@/core-contracts';

/**
 * Pure core logic for Agnet Workspace Dashboard.
 * Returns view model based on role/permissions.
 */
export function getAgentWorkspaceNavCore(_params: {
  role?: string;
  flags?: Record<string, boolean>;
}): WorkspaceNavDTO {
  return {
    pageTitle: 'Agent Pro Workspace',
    pageSubtitle: 'Advanced tools and controls for power users.',
    cards: [
      {
        id: 'leads',
        title: 'Leads (Pro)',
        iconRequest: 'users',
        headline: 'Manage All',
        description: 'Advanced filtering, bulk actions, and exports.',
        actionText: 'Open Leads',
        href: '/agent/workspace/leads',
        disabled: false,
      },
      {
        id: 'claims',
        title: 'Claims Queue',
        iconRequest: 'file-text',
        headline: 'Processing',
        description: 'Detailed claim review and adjudication tools.',
        actionText: 'Open Queue',
        href: '/agent/workspace/claims',
        disabled: false,
      },
      {
        id: 'reports',
        title: 'Reports',
        iconRequest: 'bar-chart',
        headline: 'Analytics',
        description: 'Performance metrics and commission reports.',
        actionText: 'Coming Soon',
        disabled: true,
      },
    ],
  };
}
