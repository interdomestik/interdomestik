import {
  freeStartDraftPayloadSchema,
  normalizeFreeStartDraftText,
} from '@/lib/validators/free-start-draft';
import { describe, expect, it } from 'vitest';

const medicalTokens = [
  'injury',
  'injured',
  'doctor',
  'hospital',
  'pain',
  'blood',
  'medical',
  'diagnosis',
  'treatment',
  'lëndim',
  'lënduar',
  'mjek',
  'mjeku',
  'spital',
  'dhimbje',
  'gjak',
  'mjekësor',
  'diagnozë',
  'trajtim',
  'povreda',
  'povređen',
  'povređena',
  'lekar',
  'doktor',
  'bolnica',
  'bol',
  'krv',
  'medicinski',
  'dijagnoza',
  'lečenje',
  'повреда',
  'повреден',
  'повредена',
  'лекар',
  'доктор',
  'болница',
  'болка',
  'крв',
  'медицински',
  'дијагноза',
  'лекување',
] as const;

const basePayload = {
  category: 'vehicle',
  issueType: 'collision',
  incidentDate: '2024-02-29',
  counterparty: 'Example Insurer',
  desiredOutcome: 'written_response',
  summary: 'Supported event facts only.',
  resumeStep: 'preview',
};

describe('freeStartDraftPayloadSchema C01-C06', () => {
  it('C01 accepts strict partial vehicle and property drafts but rejects an empty draft', () => {
    expect(freeStartDraftPayloadSchema.safeParse({ category: 'vehicle' }).success).toBe(true);
    expect(freeStartDraftPayloadSchema.safeParse({ category: 'property' }).success).toBe(true);
    expect(freeStartDraftPayloadSchema.safeParse({}).success).toBe(false);
  });

  it('C02 enforces the exact category and issue matrix', () => {
    const accepted = {
      vehicle: ['collision', 'theft', 'parking_damage', 'insurer_delay'],
      property: ['water_damage', 'storm_fire', 'burglary', 'landlord_dispute'],
    } as const;

    for (const [category, issues] of Object.entries(accepted)) {
      for (const issueType of issues) {
        expect(freeStartDraftPayloadSchema.safeParse({ category, issueType }).success).toBe(true);
      }
    }

    expect(
      freeStartDraftPayloadSchema.safeParse({ category: 'vehicle', issueType: 'water_damage' })
        .success
    ).toBe(false);
    expect(
      freeStartDraftPayloadSchema.safeParse({ category: 'property', issueType: 'collision' })
        .success
    ).toBe(false);
  });

  it('C03 rejects injury, unknown categories, health fields and unknown keys', () => {
    expect(freeStartDraftPayloadSchema.safeParse({ category: 'injury' }).success).toBe(false);
    expect(freeStartDraftPayloadSchema.safeParse({ category: 'medical_negligence' }).success).toBe(
      false
    );
    expect(freeStartDraftPayloadSchema.safeParse({ category: 'other' }).success).toBe(false);
    expect(
      freeStartDraftPayloadSchema.safeParse({ category: 'vehicle', injuryDetails: 'none' }).success
    ).toBe(false);
    expect(
      freeStartDraftPayloadSchema.safeParse({ category: 'vehicle', ownerUserId: 'client-value' })
        .success
    ).toBe(false);
  });

  it('C04 rejects every fixed SQ/EN/SR/MK medical token without fuzzy matching', () => {
    for (const token of medicalTokens) {
      expect(
        freeStartDraftPayloadSchema.safeParse({
          ...basePayload,
          summary: `Supported fact; ${token.toUpperCase()}.`,
        }).success,
        token
      ).toBe(false);
    }
  });

  it('C05 accepts unlisted substrings, plurals and adjacent-letter tokens', () => {
    for (const token of medicalTokens) {
      expect(
        freeStartDraftPayloadSchema.safeParse({ ...basePayload, summary: `event ${token}x` })
          .success,
        token
      ).toBe(true);
    }
    expect(freeStartDraftPayloadSchema.safeParse(basePayload).success).toBe(true);
  });

  it('C06 applies exact idempotent text and real-calendar-date normalization', () => {
    const once = normalizeFreeStartDraftText('\u00a0Ａgency\r\n  Keeps  Space\r\u2003');
    expect(once).toBe('Agency\n  Keeps  Space');
    if (!once) throw new Error('expected normalized text');
    expect(normalizeFreeStartDraftText(once)).toBe(once);
    expect(normalizeFreeStartDraftText('\u00a0 \r\n\u2003')).toBeNull();

    const parsed = freeStartDraftPayloadSchema.parse({
      ...basePayload,
      counterparty: '\u00a0Ａgency\r\nLine\u2003',
      summary: '\u2003Facts\rkept\u00a0',
    });
    expect(parsed.counterparty).toBe('Agency\nLine');
    expect(parsed.summary).toBe('Facts\nkept');
    expect(parsed.incidentDate).toBe('2024-02-29');
    expect(
      freeStartDraftPayloadSchema.safeParse({ ...basePayload, incidentDate: '2023-02-29' }).success
    ).toBe(false);
    expect(
      freeStartDraftPayloadSchema.safeParse({ ...basePayload, incidentDate: '2024-2-29' }).success
    ).toBe(false);
  });
});
