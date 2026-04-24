import { describe, expect, it } from 'vitest';
import { getEvidenceChecklist } from './evidence-checklist';
import type { InjuryIntakeAnswers, PropertyIntakeAnswers, VehicleIntakeAnswers } from './types';

describe('getEvidenceChecklist', () => {
  describe('vehicle claims', () => {
    it('returns 6 items for vehicle claims', () => {
      const answers: VehicleIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Rear-end collision at intersection',
      };
      const result = getEvidenceChecklist('vehicle', answers);
      expect(result.claimType).toBe('vehicle');
      expect(result.items).toHaveLength(6);
    });

    it('marks photos as likely available when hasDamagePhotos is true', () => {
      const answers: VehicleIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Collision',
        hasDamagePhotos: true,
      };
      const result = getEvidenceChecklist('vehicle', answers);
      const photos = result.items.find(i => i.id === 'vehicle_photos');
      expect(photos?.likelyAvailable).toBe(true);
      expect(photos?.status).toBe('provided');
    });

    it('marks police report as likely available when filed', () => {
      const answers: VehicleIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Collision',
        policeReportFiled: true,
      };
      const result = getEvidenceChecklist('vehicle', answers);
      const report = result.items.find(i => i.id === 'vehicle_police_report');
      expect(report?.likelyAvailable).toBe(true);
    });

    it('marks insurer details as likely available when counterpartyInsurer is provided', () => {
      const answers: VehicleIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Collision',
        counterpartyInsurer: 'Sigal Insurance',
      };
      const result = getEvidenceChecklist('vehicle', answers);
      const insurer = result.items.find(i => i.id === 'vehicle_insurance_details');
      expect(insurer?.likelyAvailable).toBe(true);
    });

    it('counts required items correctly', () => {
      const answers: VehicleIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Collision',
      };
      const result = getEvidenceChecklist('vehicle', answers);
      expect(result.requiredCount).toBe(3); // photos, police report, insurance details
      expect(result.items.find(i => i.id === 'vehicle_photos')?.status).toBe('missing');
    });

    it('counts likely available items correctly', () => {
      const answers: VehicleIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Collision',
        hasDamagePhotos: true,
        policeReportFiled: true,
      };
      const result = getEvidenceChecklist('vehicle', answers);
      expect(result.likelyAvailableCount).toBe(2);
    });
  });

  describe('property claims', () => {
    it('returns 6 items for property claims', () => {
      const answers: PropertyIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Water damage from neighbor',
      };
      const result = getEvidenceChecklist('property', answers);
      expect(result.claimType).toBe('property');
      expect(result.items).toHaveLength(6);
    });

    it('marks ownership proof as likely available when provided', () => {
      const answers: PropertyIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Water damage',
        hasOwnershipProof: true,
      };
      const result = getEvidenceChecklist('property', answers);
      const ownership = result.items.find(i => i.id === 'property_ownership');
      expect(ownership?.likelyAvailable).toBe(true);
    });
  });

  describe('injury claims', () => {
    it('returns 6 items for injury claims', () => {
      const answers: InjuryIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Slip and fall at workplace',
      };
      const result = getEvidenceChecklist('injury', answers);
      expect(result.claimType).toBe('injury');
      expect(result.items).toHaveLength(6);
    });

    it('marks medical records as likely available', () => {
      const answers: InjuryIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Injury',
        hasMedicalRecords: true,
      };
      const result = getEvidenceChecklist('injury', answers);
      const medical = result.items.find(i => i.id === 'injury_medical_records');
      expect(medical?.likelyAvailable).toBe(true);
    });

    it('counts required items correctly for injury', () => {
      const answers: InjuryIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Injury',
      };
      const result = getEvidenceChecklist('injury', answers);
      expect(result.requiredCount).toBe(3); // medical, incident report, expense receipts
    });
  });
});
