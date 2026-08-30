import { createElement, type ComponentType, type ReactElement } from 'react';

import type { CaseSummary, CaseSummaryKind } from '@interdomestik/domain-member';

import {
  type CaseSummaryLabels,
  CaseSummaryCard,
  type CaseSummaryCardProps,
} from './accident-case-summary';
import { GenericCaseSummary } from './generic-case-summary';

export type CaseKindDescriptor = { component: ComponentType<CaseSummaryCardProps> };

export const caseKindRegistry = {
  accident: { component: CaseSummaryCard },
  generic: { component: GenericCaseSummary },
} satisfies Record<CaseSummaryKind, CaseKindDescriptor>;

export function renderCaseSummary(summary: CaseSummary, labels: CaseSummaryLabels): ReactElement {
  const Component = caseKindRegistry[summary.caseKind].component;
  return createElement(Component, { labels, summary });
}
