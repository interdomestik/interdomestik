import type { CaseKind } from '@interdomestik/domain-member';
import type { ComponentType } from 'react';

import { AccidentCaseSummary, type AccidentCaseSummaryProps } from './accident-case-summary';

export type CaseKindDescriptor = {
  component: ComponentType<AccidentCaseSummaryProps>;
};

export const caseKindRegistry = {
  accident: { component: AccidentCaseSummary },
} satisfies Record<CaseKind, CaseKindDescriptor>;
