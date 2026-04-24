/**
 * Evidence checklist engine.
 *
 * Returns a typed list of required and optional evidence items based on
 * claim type and intake answers. Each item indicates whether the member
 * likely already has it (based on their answers).
 */

import type {
  ClaimPackType,
  EvidenceChecklist,
  EvidenceItem,
  InjuryIntakeAnswers,
  IntakeAnswers,
  PropertyIntakeAnswers,
  VehicleIntakeAnswers,
} from './types';

type EvidenceItemDraft = Omit<EvidenceItem, 'status'>;

// ---------------------------------------------------------------------------
// Vehicle evidence items
// ---------------------------------------------------------------------------

function vehicleItems(a: VehicleIntakeAnswers): EvidenceItemDraft[] {
  return [
    {
      id: 'vehicle_photos',
      name: 'Damage photographs',
      description: 'Clear photos of all vehicle damage from multiple angles',
      required: true,
      likelyAvailable: a.hasDamagePhotos === true,
    },
    {
      id: 'vehicle_police_report',
      name: 'Police report',
      description: 'Official accident report or incident reference number',
      required: true,
      likelyAvailable: a.policeReportFiled === true,
    },
    {
      id: 'vehicle_insurance_details',
      name: 'Other party insurance details',
      description: 'Name of the other party\u0027s insurer and policy number if known',
      required: true,
      likelyAvailable: !!a.counterpartyInsurer,
    },
    {
      id: 'vehicle_repair_estimate',
      name: 'Repair estimate',
      description: 'Written estimate from a licensed mechanic or body shop',
      required: false,
      likelyAvailable: a.hasRepairEstimate === true,
    },
    {
      id: 'vehicle_registration',
      name: 'Vehicle registration',
      description: 'Copy of your vehicle registration document',
      required: false,
      likelyAvailable: false,
    },
    {
      id: 'vehicle_driver_license',
      name: 'Driver license',
      description: 'Copy of the driver\u0027s license of the person driving at the time',
      required: false,
      likelyAvailable: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Property evidence items
// ---------------------------------------------------------------------------

function propertyItems(a: PropertyIntakeAnswers): EvidenceItemDraft[] {
  return [
    {
      id: 'property_photos',
      name: 'Damage photographs',
      description: 'Photos showing the property damage clearly',
      required: true,
      likelyAvailable: a.hasDamagePhotos === true,
    },
    {
      id: 'property_ownership',
      name: 'Ownership proof',
      description:
        'Title deed, lease agreement, or utility bill showing your connection to the property',
      required: true,
      likelyAvailable: a.hasOwnershipProof === true,
    },
    {
      id: 'property_damage_report',
      name: 'Damage report',
      description: 'Written description or professional assessment of the damage',
      required: true,
      likelyAvailable: false,
    },
    {
      id: 'property_insurance_policy',
      name: 'Insurance policy',
      description: 'Copy of your property or home insurance policy',
      required: false,
      likelyAvailable: a.hasInsurancePolicy === true,
    },
    {
      id: 'property_repair_quotes',
      name: 'Repair quotes',
      description: 'Written quotes from contractors for repair work',
      required: false,
      likelyAvailable: false,
    },
    {
      id: 'property_correspondence',
      name: 'Previous correspondence',
      description: 'Any letters, emails, or messages exchanged with the responsible party',
      required: false,
      likelyAvailable: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Injury evidence items
// ---------------------------------------------------------------------------

function injuryItems(a: InjuryIntakeAnswers): EvidenceItemDraft[] {
  return [
    {
      id: 'injury_medical_records',
      name: 'Medical records',
      description:
        'Doctor reports, hospital records, or medical certificates related to your injury',
      required: true,
      likelyAvailable: a.hasMedicalRecords === true,
    },
    {
      id: 'injury_incident_report',
      name: 'Incident report',
      description: 'Official report of the incident (police, workplace, or institutional)',
      required: true,
      likelyAvailable: a.hasIncidentReport === true,
    },
    {
      id: 'injury_witness_statements',
      name: 'Witness statements',
      description: 'Written or signed statements from anyone who witnessed the incident',
      required: false,
      likelyAvailable: a.hasWitnessStatements === true,
    },
    {
      id: 'injury_expense_receipts',
      name: 'Expense receipts',
      description:
        'Receipts for medical bills, medication, transport, or other costs caused by the injury',
      required: true,
      likelyAvailable: a.hasExpenseReceipts === true,
    },
    {
      id: 'injury_photos',
      name: 'Injury photographs',
      description: 'Dated photos showing the injury, if visible',
      required: false,
      likelyAvailable: false,
    },
    {
      id: 'injury_lost_income',
      name: 'Lost income proof',
      description: 'Employer letter or pay slips showing income lost due to the injury',
      required: false,
      likelyAvailable: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getEvidenceChecklist(
  claimType: ClaimPackType,
  answers: IntakeAnswers
): EvidenceChecklist {
  let items: EvidenceItemDraft[];

  switch (claimType) {
    case 'vehicle':
      items = vehicleItems(answers as VehicleIntakeAnswers);
      break;
    case 'property':
      items = propertyItems(answers as PropertyIntakeAnswers);
      break;
    case 'injury':
      items = injuryItems(answers as InjuryIntakeAnswers);
      break;
    default: {
      const _exhaustive: never = claimType;
      throw new Error(`Unknown claim type: ${_exhaustive}`);
    }
  }

  return {
    claimType,
    items: items.map(item => ({
      ...item,
      status: item.likelyAvailable ? 'provided' : 'missing',
    })),
    requiredCount: items.filter(i => i.required).length,
    likelyAvailableCount: items.filter(i => i.likelyAvailable).length,
  };
}
