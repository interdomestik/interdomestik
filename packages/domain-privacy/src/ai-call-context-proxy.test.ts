import { describe, expect, it } from 'vitest';

import type { AICallContextFields } from './ai';
import { validateAICallContext } from './ai-call-context-validator';

const baseContext: AICallContextFields = {
  workflowId: 'case-general-assist-v1',
  owner: 'platform-privacy',
  tenantId: 'tenant_1',
  actorId: 'staff_1',
  scope: { caseId: 'case_1' },
  purpose: 'general_case',
  processingPurpose: 'staff_triage',
  retention: 'transient_no_training',
  posture: 'advisory',
  consent: 'not_required',
  invalidityPosture: 'not_applicable',
};

describe('validateAICallContext proxy hardening', () => {
  it('normalizes from one own-property snapshot of proxy-backed input', () => {
    let purposeDescriptorReads = 0;
    const input = new Proxy(
      { ...baseContext },
      {
        getOwnPropertyDescriptor(target, property) {
          if (property === 'purpose') {
            purposeDescriptorReads += 1;
            return {
              configurable: true,
              enumerable: true,
              value: purposeDescriptorReads > 2 ? 'invalidity_review' : 'general_case',
            };
          }
          return Object.getOwnPropertyDescriptor(target, property);
        },
      }
    );

    const decision = validateAICallContext(input);

    expect(decision.kind).toBe('invalid');
    expect(purposeDescriptorReads).toBe(1);
    expect(decision.reasons).toContain('context_untrusted');
  });
});
