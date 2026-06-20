import { describe, expect, it } from 'vitest';

import {
  type AICallContext,
  AI_CALL_CONSENT_POSTURES,
  AI_CALL_INVALIDITY_POSTURES,
  AI_CALL_POSTURES,
  AI_CALL_PURPOSES,
  AI_CALL_RETENTION_POSTURES,
} from './ai';
import { validateAICallContext } from './ai-call-context-validator';

const baseContext: AICallContext = {
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

describe('AICallContext', () => {
  it('publishes literal contract sets for purpose, retention, posture, consent, and invalidity posture', () => {
    expect(AI_CALL_PURPOSES).toEqual(['general_case', 'document_extraction', 'invalidity_review']);
    expect(AI_CALL_RETENTION_POSTURES).toContain('zero_retention_no_training');
    expect(AI_CALL_POSTURES).toEqual(['disabled', 'advisory', 'human_review_required']);
    expect(AI_CALL_CONSENT_POSTURES).toEqual(['not_required', 'required_granted']);
    expect(AI_CALL_INVALIDITY_POSTURES).toContain('human_review_required');
  });

  it('accepts a general case context without claiming final decision authority', () => {
    const decision = validateAICallContext(baseContext);

    expect(decision.kind).toBe('valid');
    if (decision.kind === 'valid') {
      expect(decision.context.purpose).toBe('general_case');
      expect(decision.context.posture).toBe('advisory');
      expect(decision.context.consent).toBe('not_required');
    }
  });

  it('accepts invalidity review only with consent and human-review posture', () => {
    const decision = validateAICallContext({
      ...baseContext,
      workflowId: 'invalidity-posture-review-v1',
      purpose: 'invalidity_review',
      processingPurpose: 'invalidity_review',
      retention: 'zero_retention_no_training',
      posture: 'human_review_required',
      consent: 'required_granted',
      invalidityPosture: 'human_review_required',
    });

    expect(decision.kind).toBe('valid');
  });

  it('rejects missing or unsupported posture and consent states', () => {
    const missing = validateAICallContext({
      ...baseContext,
      posture: undefined,
      consent: undefined,
    });
    const unsupported = validateAICallContext({
      ...baseContext,
      posture: 'trusted_automation',
      consent: 'implied',
    });

    expect(missing.kind).toBe('invalid');
    expect(missing.reasons).toEqual(expect.arrayContaining(['posture_missing', 'consent_missing']));
    expect(unsupported.kind).toBe('invalid');
    expect(unsupported.reasons).toEqual(
      expect.arrayContaining(['posture_unsupported', 'consent_unsupported'])
    );
  });

  it('rejects otherwise literal-valid contexts with missing required identity fields', () => {
    const decision = validateAICallContext({
      purpose: 'general_case',
      processingPurpose: 'staff_triage',
      retention: 'transient_no_training',
      posture: 'advisory',
      consent: 'not_required',
      invalidityPosture: 'not_applicable',
    });

    expect(decision.kind).toBe('invalid');
    expect(decision.reasons).toEqual(
      expect.arrayContaining([
        'workflow_id_missing',
        'owner_missing',
        'tenant_id_missing',
        'actor_id_missing',
        'scope_missing',
      ])
    );
  });

  it('rejects invalid processing purpose and optional subject id shape', () => {
    const decision = validateAICallContext({
      ...baseContext,
      processingPurpose: 'freeform_ai_reason',
      subjectId: '',
    });

    expect(decision.kind).toBe('invalid');
    expect(decision.reasons).toEqual(
      expect.arrayContaining(['processing_purpose_unsupported', 'subject_id_invalid'])
    );
  });

  it('fails closed for document extraction without zero retention and granted consent', () => {
    const decision = validateAICallContext({
      ...baseContext,
      purpose: 'document_extraction',
      processingPurpose: 'ai_document_extraction',
      retention: 'transient_no_training',
      consent: 'not_required',
    });

    expect(decision.kind).toBe('invalid');
    expect(decision.reasons).toEqual(
      expect.arrayContaining([
        'document_extraction_requires_zero_retention',
        'document_extraction_requires_consent',
      ])
    );
  });
});
