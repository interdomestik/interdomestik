import { describe, expect, it } from 'vitest';

import type { AICallContextFields } from './ai';
import { mintRequired } from './ai-call-context-test-helpers';
import { validateAICallContext } from './ai-call-context-validator';

const validContextInput: AICallContextFields = {
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

describe('validateAICallContext inherited fields', () => {
  it('rejects inherited top-level fields and getter-backed values', () => {
    const validContext = mintRequired(validContextInput);
    const decision = validateAICallContext(Object.create(validContext));
    const getterInput = { ...validContext };
    Object.defineProperty(getterInput, 'workflowId', {
      enumerable: true,
      get: () => {
        throw new Error('getter should not be invoked');
      },
    });
    const getterDecision = validateAICallContext(getterInput);

    expect(decision.kind).toBe('invalid');
    expect(decision.reasons).toEqual(
      expect.arrayContaining([
        'workflow_id_missing',
        'owner_missing',
        'tenant_id_missing',
        'actor_id_missing',
        'scope_missing',
        'processing_purpose_unsupported',
        'purpose_unsupported',
        'retention_unsupported',
        'posture_missing',
        'consent_missing',
        'invalidity_posture_missing',
      ])
    );
    expect(getterDecision.kind).toBe('invalid');
    expect(getterDecision.reasons).toContain('workflow_id_missing');
  });
});
