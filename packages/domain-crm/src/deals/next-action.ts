import type { CrmDeal } from './types';

export type CrmDealNextAction =
  | { type: 'none' }
  | { type: 'expected_close'; dueAt: string }
  | { type: 'review' };

export function deriveDealNextAction(
  deal: Pick<CrmDeal, 'closedAt' | 'expectedCloseAt'>
): CrmDealNextAction {
  if (deal.closedAt) return { type: 'none' };
  if (deal.expectedCloseAt) return { type: 'expected_close', dueAt: deal.expectedCloseAt };
  return { type: 'review' };
}
