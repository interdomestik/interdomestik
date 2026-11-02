import { describe, expect, it } from 'vitest';

import { resolveCommercialFlow } from './submit-commercial-flow';

describe('resolveCommercialFlow', () => {
  it('requests escalation for a launch-scope category', () => {
    expect(resolveCommercialFlow('vehicle')).toEqual({
      escalationRequest: {
        claimCategory: 'vehicle',
        decision: 'requested',
        decisionReason: 'launch_scope_supported',
      },
      freeStartCompletion: { claimCategory: 'vehicle' },
    });
  });

  it('declines escalation outside the launch scope and keeps the category', () => {
    expect(resolveCommercialFlow('transport')).toEqual({
      escalationRequest: {
        claimCategory: 'transport',
        decision: 'declined',
        decisionReason: 'outside_launch_scope',
      },
      freeStartCompletion: { claimCategory: 'transport' },
    });
  });

  it('normalizes an unrecognized category to trimmed lower case', () => {
    const flow = resolveCommercialFlow('  Something Else ');

    expect(flow.escalationRequest.decision).toBe('declined');
    expect(flow.freeStartCompletion.claimCategory).toBe('something else');
  });
});
