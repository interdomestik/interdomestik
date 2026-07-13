const suggestion = (concreteAnswer, reason, riskCategory, responses) => ({
  concreteAnswer,
  reason,
  riskCategory,
  severity: 'high',
  responses,
  useSessionDateFor: ['verifiedAt'],
});

export const expectedSuggestions = {
  'M03A-MEDICAL-BOUNDARY': suggestion(
    'Të dhënat mjekësore dhe të lëndimeve mbeten të përjashtuara.',
    'Nuk ka autoritet të nënshkruar ose të pranuar DPIA/Neni 9.',
    'privacy',
    {
      medicalBoundary: 'excluded',
      disabledScope:
        'Çaktivizo pranimin, shfaqjen, ngarkimin, ruajtjen dhe përpunimin e të dhënave mjekësore ose të lëndimeve.',
    }
  ),
  'M03A-CONSENT-FIELDS': suggestion(
    'Prano vetëm metadata-t minimale të pëlqimit si kërkesë shqyrtimi.',
    'Fushat e pranuara nuk japin autoritet për schema ose runtime.',
    'compliance',
    {
      acceptedMinimumFields: ['consentStatus', 'recordedAt', 'consentVersion'],
      additions: 'Asnjë shtesë pa autoritet të ri.',
      excludedFields:
        'Evidencë e papërpunuar, identitet, përmbajtje dokumenti, nënshkrime, tekst personal, të dhëna mjekësore ose pagese.',
    }
  ),
  'M03A-ACCESS-ROLES': suggestion(
    'Lejo vetëm metadata të kufizuara për anëtarin dhe rolin e brendshëm të rastit.',
    'Qasja për sponsorin, paguesin dhe palët e jashtme nuk ka autoritet të pranuar.',
    'access',
    {
      memberDecision: 'view',
      internalCaseRoleDecision: 'view',
      sponsorDecision: 'exclude',
      payerDecision: 'exclude',
      externalPartyDecision: 'exclude',
    }
  ),
  'M03A-DOCUMENT-BOUNDARY': suggestion(
    'Shfaq vetëm metadata; mos shfaq përmbajtjen e dokumentit burimor.',
    'Kufiri i pranuar lejon vetëm gjendjen, kategorinë dhe datën e përditësimit.',
    'privacy',
    {
      allowedMetadata: ['state', 'category', 'updatedAt'],
      forbiddenCategories: ['raw_document', 'payment', 'medical', 'legal_private'],
    }
  ),
  'M03A-THREAT-RECHECK': suggestion(
    'Rikontrolli është clear për kufirin MK, jo-mjekësor dhe vetëm shfaqje.',
    'Përmbajtja, lidhjet, storage, palët e jashtme dhe writer-at mbeten të përjashtuara.',
    'security',
    {
      threatAreas: ['access', 'retention', 'disclosure'],
      recheckOutcome: 'clear',
      threatRecheckEvidenceRef: 'docs/product/2026-07-11-mob-03a-targeted-threat-recheck.md',
    }
  ),
  'M03A-ERASURE-REVOCATION': suggestion(
    'Ruaj vetëm skeletin jo-sensitiv; fshih të dhënat e subjektit dhe lidhjet pas fshirjes ose revokimit.',
    'Konteksti operacional mund të ruhet pa ekspozuar subjektin e fshirë ose pëlqimin e revokuar.',
    'privacy',
    { renderingRule: 'hide_metadata' }
  ),
  'M03A-SCOPE-STOPS': suggestion(
    'Kufizo MOB-03a te baza Vault + Consent për automjet/pronë, vetëm MK dhe jo-mjekësore.',
    'Scope-i i ngushtë shmang writer-at, sipërfaqet e mbrojtura dhe ekspozimin KS/AL.',
    'scope',
    {
      allowedScope:
        'Vetëm Interdomestik MK: bazë shfaqjeje Vault + Consent për automjet/pronë, jo-mjekësore.',
      excludedScope:
        'Mjekësore/lëndime; dokumente ose lidhje; writer/status; schema/RLS; auth/proxy; billing; palë të jashtme; KS/AL.',
      stopCondition: 'missing_authority',
    }
  ),
};
