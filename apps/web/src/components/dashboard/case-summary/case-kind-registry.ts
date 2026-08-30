import type { CaseSummary, CaseSummaryKind } from '@interdomestik/domain-member';
import type { ComponentType } from 'react';
import { createElement, type ReactElement } from 'react';

import {
  AccidentCaseSummary,
  type AccidentCaseSummaryProps,
  type CaseSummaryLabels,
} from './accident-case-summary';
import { GenericCaseSummary } from './generic-case-summary';

export type CaseKindDescriptor = { component: ComponentType<AccidentCaseSummaryProps> };

export const caseKindRegistry = {
  accident: { component: AccidentCaseSummary },
  generic: { component: GenericCaseSummary },
} satisfies Record<CaseSummaryKind, CaseKindDescriptor>;

export function renderCaseSummary(summary: CaseSummary, labels: CaseSummaryLabels): ReactElement {
  const Component = caseKindRegistry[summary.caseKind].component;
  return createElement(Component, { labels, summary });
}
