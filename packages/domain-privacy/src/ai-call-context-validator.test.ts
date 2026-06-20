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
    const inheritedScope = validateAICallContext({ ...validContext, scope: Object.create({ caseId: 'case_1' }) });
    const getterScopeInput = { ...validContext };
    Object.defineProperty(getterScopeInput, 'scope', { enumerable: true, get: () => { throw new Error('boom'); } });
    const getterScope = validateAICallContext(getterScopeInput);
    expect(arrayScope.kind).toBe('invalid');
    expect(arrayScope.reasons).toContain('scope_invalid');
    expect(emptyScope.kind).toBe('invalid');
    expect(emptyScope.reasons).toContain('scope_invalid');
    expect(malformedScope.kind).toBe('invalid');
    expect(malformedScope.reasons).toContain('scope_invalid');
    expect(inheritedScope.kind).toBe('invalid');
    expect(inheritedScope.reasons).toContain('scope_invalid');
    expect(getterScope.kind).toBe('invalid');
    expect(getterScope.reasons).toContain('scope_invalid');
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
  it('returns a trimmed, explicit normalized context instead of the caller object', () => {
    const decision = validateAICallContext({
      ...validContext,
      workflowId: ' case-general-assist-v1 ',
      owner: ' platform-privacy ',
      tenantId: ' tenant_1 ',
      actorId: ' staff_1 ',
      extraField: 'ignored',
      scope: { caseId: ' case_1 ', unsafe: 'ignored' },
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
  it('rejects consent-gated contexts without a subject id', () => {
    const documentDecision = validateAICallContext({
      ...validContext,
      purpose: 'document_extraction',
      processingPurpose: 'ai_document_extraction',
      retention: 'zero_retention_no_training',
      consent: 'required_granted',
    });
    const invalidityDecision = validateAICallContext({
      ...validContext,
      purpose: 'invalidity_review',
      processingPurpose: 'invalidity_review',
      retention: 'zero_retention_no_training',
      posture: 'human_review_required',
      consent: 'required_granted',
      invalidityPosture: 'human_review_required',
    });

    expect(documentDecision.kind).toBe('invalid');
    expect(documentDecision.reasons).toContain('subject_id_required_for_consent');
    expect(invalidityDecision.kind).toBe('invalid');
    expect(invalidityDecision.reasons).toContain('subject_id_required_for_consent');
  });
  it('requires zero retention for invalidity review', () => {
    const decision = validateAICallContext({
      ...validContext,
      subjectId: 'member_1',
      purpose: 'invalidity_review',
      processingPurpose: 'invalidity_review',
      posture: 'human_review_required',
      consent: 'required_granted',
      invalidityPosture: 'human_review_required',
    });

    expect(decision.kind).toBe('invalid');
    expect(decision.reasons).toContain('invalidity_review_requires_zero_retention');
  });
  it('rejects inherited top-level fields instead of accepting prototype-backed input', () => {
    const decision = validateAICallContext(Object.create(validContext));
    const getterInput = { ...validContext };
    Object.defineProperty(getterInput, 'workflowId', { enumerable: true, get: () => { throw new Error('boom'); } });
    const getterDecision = validateAICallContext(getterInput);
    expect(decision.kind).toBe('invalid');
    expect(decision.reasons).toEqual(expect.arrayContaining([
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
    ]));
    expect(getterDecision.kind).toBe('invalid');
    expect(getterDecision.reasons).toContain('workflow_id_missing');
  });
});
