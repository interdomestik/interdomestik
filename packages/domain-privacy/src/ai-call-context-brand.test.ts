import { describe, expect, it } from 'vitest';

import type { AICallContextFields } from './ai';
import { mintRequired } from './ai-call-context-test-helpers';
import { validateAICallContext } from './ai-call-context-validator';

const contextInput: AICallContextFields = {
  workflowId: 'case-general-assist-v1',
  owner: 'platform-privacy',
  tenantId: 'tenant_1',
  actorId: 'staff_1',
  subjectId: 'member_1',
  scope: { caseId: 'case_1', claimId: 'claim_1' },
  purpose: 'general_case',
  processingPurpose: 'staff_triage',
  retention: 'transient_no_training',
  posture: 'advisory',
  consent: 'not_required',
  invalidityPosture: 'not_applicable',
};

describe('AICallContext brand authority', () => {
  it('does not expose a copyable runtime brand marker', () => {
    const context = mintRequired(contextInput);

    expect(Object.getOwnPropertySymbols(context)).toEqual([]);
  });

  it('rejects copied context objects even when every visible field matches', () => {
    const context = mintRequired(contextInput);
    const copiedContext = { ...context };
    const decision = validateAICallContext(copiedContext);

    expect(copiedContext).toEqual(context);
    expect(decision.kind).toBe('invalid');
    expect(decision.reasons).toContain('context_untrusted');
  });
});
