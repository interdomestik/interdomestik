import {
  generateClaimPack,
  type ClaimPack,
  type ClaimPackType,
} from '@interdomestik/domain-claims/claim-pack';

export type ResultLocale = 'en' | 'mk' | 'sq' | 'sr';

export function createClaimPack(
  locale: ResultLocale = 'en',
  claimType: ClaimPackType = 'property'
): ClaimPack {
  const common = {
    description: 'A detailed description that must not become public interface copy.',
    generatedAt: '2026-04-24T08:00:00.000Z',
    incidentDate: '2026-03-01',
    locale,
  };

  if (claimType === 'vehicle') {
    return generateClaimPack({
      ...common,
      claimType,
      answers: {
        description: common.description,
        hasDamagePhotos: true,
        incidentDate: common.incidentDate,
        policeReportFiled: true,
      },
    });
  }

  if (claimType === 'injury') {
    return generateClaimPack({
      ...common,
      claimType,
      answers: {
        description: common.description,
        hasExpenseReceipts: true,
        hasIncidentReport: true,
        hasMedicalRecords: true,
        incidentDate: common.incidentDate,
      },
    });
  }

  return generateClaimPack({
    ...common,
    claimType,
    answers: {
      description: common.description,
      hasDamagePhotos: true,
      hasOwnershipProof: true,
      incidentDate: common.incidentDate,
    },
  });
}
