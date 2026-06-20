import { describe, expect, it } from 'vitest';

import type { AICallContext } from './ai';
import { validateAICallContext } from './ai-call-context-validator';

const validContext: AICallContext = {
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

describe('validateAICallContext hardening', () => {
  it('rejects array, empty, and malformed privacy scopes', () => {
    const arrayScope = validateAICallContext({ ...validContext, scope: [] });
    const emptyScope = validateAICallContext({ ...validContext, scope: {} });
    const malformedScope = validateAICallContext({ ...validContext, scope: { caseId: '' } });

    expect(arrayScope.kind).toBe('invalid');
    expect(arrayScope.reasons).toContain('scope_invalid');
    expect(emptyScope.kind).toBe('invalid');
    expect(emptyScope.reasons).toContain('scope_invalid');
    expect(malformedScope.kind).toBe('invalid');
    expect(malformedScope.reasons).toContain('scope_invalid');
  });

  it('rejects mismatched purpose, processing purpose, and disabled posture combinations', () => {
    const documentMismatch = validateAICallContext({
      ...validContext,
      purpose: 'document_extraction',
      processingPurpose: 'staff_triage',
      retention: 'zero_retention_no_training',
      consent: 'required_granted',
    });
    const disabledInvalidity = validateAICallContext({
      ...validContext,
      purpose: 'invalidity_review',
      processingPurpose: 'invalidity_review',
      posture: 'disabled',
      consent: 'required_granted',
      invalidityPosture: 'human_review_required',
    });

    expect(documentMismatch.kind).toBe('invalid');
    expect(documentMismatch.reasons).toContain('processing_purpose_mismatch');
    expect(disabledInvalidity.kind).toBe('invalid');
    expect(disabledInvalidity.reasons).toContain('disabled_posture_requires_general_case');
  });

  it('returns an explicit normalized context instead of the caller object', () => {
    const decision = validateAICallContext({
      ...validContext,
      extraField: 'ignored',
      scope: { caseId: 'case_1', unsafe: 'ignored' },
    });

    expect(decision.kind).toBe('valid');
    if (decision.kind === 'valid') {
      expect(decision.context).toEqual(validContext);
      expect('extraField' in decision.context).toBe(false);
      expect('unsafe' in decision.context.scope).toBe(false);
    }
  });

  it('omits subjectId from normalized context when callers do not provide it', () => {
    const decision = validateAICallContext(validContext);

    expect(decision.kind).toBe('valid');
    if (decision.kind === 'valid') {
      expect('subjectId' in decision.context).toBe(false);
      expect(decision.context).toEqual(validContext);
    }
  });
});
