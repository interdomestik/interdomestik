import type { CreateClaimValues } from '../validators/claims';
import type { ClaimsDeps, ClaimsSession } from './types';

export function notifyClaimSubmitted(args: {
  deps: ClaimsDeps;
  session: ClaimsSession;
  claimId: string;
  tenantId: string;
  data: CreateClaimValues;
}) {
  if (!args.deps.notifyClaimSubmitted) {
    return;
  }

  Promise.resolve(
    args.deps.notifyClaimSubmitted(
      args.session.user.id,
      args.session.user.email || '',
      {
        id: args.claimId,
        title: args.data.title,
        category: args.data.category,
      },
      { tenantId: args.tenantId }
    )
  ).catch((err: Error) => console.error('Failed to send claim submitted notification:', err));
}
