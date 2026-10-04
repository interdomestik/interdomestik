/** One generated property claim pack, shaped exactly as the pack action returns it. */
export function createGeneratedClaimPackFixture() {
  return {
    generatedAt: '2026-04-24T08:00:00.000Z',
    claimType: 'property',
    intakeAnswers: {
      incidentDate: '2026-03-01',
      description: 'Water entered through the roof after a storm and damaged two rooms.',
    },
    confidence: {
      score: 72,
      level: 'high',
      factors: [
        {
          name: 'Incident recency',
          pointsEarned: 20,
          maxPoints: 20,
          explanation: 'Recent incident',
        },
      ],
    },
    evidenceChecklist: {
      claimType: 'property',
      requiredCount: 3,
      likelyAvailableCount: 1,
      items: [
        {
          id: 'property_photos',
          name: 'Damage photographs',
          description: 'Photos showing the property damage clearly',
          required: true,
          status: 'missing',
          likelyAvailable: false,
        },
      ],
    },
    letter: {
      locale: 'en',
      body: 'Draft property damage letter',
      placeholders: ['[YOUR_FULL_NAME]'],
    },
    timeline: {
      claimType: 'property',
      confidenceLevel: 'high',
      milestones: [
        {
          id: 'first_letter',
          label: 'First letter sent',
          estimatedRange: '1-2 days',
          description: 'Send your complaint letter',
        },
      ],
    },
    recommendedNextStep: {
      level: 'high',
      title: 'Strong case',
      description: 'Join Asistenca for human triage.',
      ctaLabel: 'Join Asistenca',
      ctaHref: '/pricing',
    },
    disclaimer: 'This is informational guidance only, not legal advice.',
  };
}
