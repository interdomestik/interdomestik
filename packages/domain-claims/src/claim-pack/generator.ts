/**
 * Claim pack generator — orchestrator.
 *
 * Ties together evidence checklist, confidence scoring, letter generation,
 * and timeline estimation into one cohesive ClaimPack output.
 */

import { calculateConfidence } from './confidence';
import { getEvidenceChecklist } from './evidence-checklist';
import { generateLetter } from './letter-template';
import { estimateTimeline } from './timeline';
import type { ClaimPack, ClaimPackInput, ConfidenceLevel, RecommendedNextStep } from './types';

// ---------------------------------------------------------------------------
// Recommended next step
// ---------------------------------------------------------------------------

function resolveNextStep(level: ConfidenceLevel): RecommendedNextStep {
  switch (level) {
    case 'high':
      return {
        level: 'high',
        title: 'Strong case — get expert triage',
        description:
          'Your claim shows strong potential. Join Asistenca for human triage within 24 business hours and staff-led recovery support.',
        ctaLabel: 'Join Asistenca',
        ctaHref: '/pricing',
      };
    case 'medium':
      return {
        level: 'medium',
        title: 'Good potential — complete your evidence',
        description:
          'Complete your evidence checklist to strengthen your case, then upgrade for expert review and guided handling.',
        ctaLabel: 'Complete evidence & join',
        ctaHref: '/pricing',
      };
    case 'low':
      return {
        level: 'low',
        title: 'Review your options',
        description:
          'Based on the information provided, your situation may require a different approach. Review our guidance resources or contact support for advice.',
        ctaLabel: 'View guidance resources',
        ctaHref: '/services',
      };
  }
}

// ---------------------------------------------------------------------------
// Disclaimer
// ---------------------------------------------------------------------------

const DISCLAIMER =
  'This claim pack is informational guidance only, not legal advice. ' +
  'Interdomestik does not guarantee any outcome. Confidence scores reflect ' +
  'the completeness of information provided and are not predictions of success. ' +
  'Consult a qualified legal professional for legal advice specific to your situation.';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateClaimPack(input: ClaimPackInput): ClaimPack {
  const { claimType, answers, locale = 'en', uploadedFileCount = 0 } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const referenceDate = new Date(generatedAt);

  const confidence = calculateConfidence(claimType, answers, uploadedFileCount, referenceDate);
  const evidenceChecklist = getEvidenceChecklist(claimType, answers);
  const letter = generateLetter(claimType, answers, locale);
  const timeline = estimateTimeline(claimType, confidence.level);
  const recommendedNextStep = resolveNextStep(confidence.level);

  return {
    generatedAt,
    claimType,
    intakeAnswers: answers,
    confidence,
    evidenceChecklist,
    letter,
    timeline,
    recommendedNextStep,
    disclaimer: DISCLAIMER,
  };
}
