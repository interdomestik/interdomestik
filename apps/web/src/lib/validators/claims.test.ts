/**
 * Claims Validators Tests
 *
 * Unit tests for Zod validation schemas used in claim forms.
 */

import {
  claimCategorySchema,
  claimDetailsSchema,
  claimEvidenceSchema,
  createClaimSchema,
} from '@/lib/validators/claims';
import { describe, expect, it } from 'vitest';

describe('Claim Validators', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // CATEGORY SCHEMA TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('claimCategorySchema', () => {
    it('should accept valid category', () => {
      const result = claimCategorySchema.safeParse({ category: 'retail' });
      expect(result.success).toBe(true);
    });

    it('should reject empty category', () => {
      const result = claimCategorySchema.safeParse({ category: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Category is required');
      }
    });

    it('should reject missing category', () => {
      const result = claimCategorySchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DETAILS SCHEMA TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('claimDetailsSchema', () => {
    const validDetails = {
      title: 'Defective product refund',
      companyName: 'Test Company',
      description: 'I purchased a product that was defective and want a refund.',
    };

    it('should accept valid details', () => {
      const result = claimDetailsSchema.safeParse(validDetails);
      expect(result.success).toBe(true);
    });

    it('should reject title shorter than 5 characters', () => {
      const result = claimDetailsSchema.safeParse({
        ...validDetails,
        title: 'Hi',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Title must be at least 5 characters');
      }
    });

    it('should reject empty company name', () => {
      const result = claimDetailsSchema.safeParse({
        ...validDetails,
        companyName: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject description shorter than 20 characters', () => {
      const result = claimDetailsSchema.safeParse({
        ...validDetails,
        description: 'Too short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Please provide more detail (min 20 chars)');
      }
    });

    it('should accept optional incidentDate when valid', () => {
      const result = claimDetailsSchema.safeParse({
        ...validDetails,
        incidentDate: '2024-01-15',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid incidentDate format', () => {
      const result = claimDetailsSchema.safeParse({
        ...validDetails,
        incidentDate: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional claimAmount', () => {
      const result = claimDetailsSchema.safeParse({
        ...validDetails,
        claimAmount: '250.00',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.claimAmount).toBe('250.00');
      }
    });

    it('should default currency to EUR', () => {
      const result = claimDetailsSchema.safeParse(validDetails);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('EUR');
      }
    });

    it('should allow custom currency', () => {
      const result = claimDetailsSchema.safeParse({
        ...validDetails,
        currency: 'USD',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVIDENCE SCHEMA TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('claimEvidenceSchema', () => {
    const sampleFile = {
      id: 'file-1',
      name: 'receipt.pdf',
      path: 'pii/claims/user123/receipt.pdf',
      type: 'application/pdf',
      size: 1024,
      bucket: 'claim-evidence',
      classification: 'pii',
    };

    it('should accept empty files array', () => {
      const result = claimEvidenceSchema.safeParse({ files: [] });
      expect(result.success).toBe(true);
    });

    it('should accept files array with items', () => {
      const result = claimEvidenceSchema.safeParse({
        files: [sampleFile],
      });
      expect(result.success).toBe(true);
    });

    it('should accept missing files field', () => {
      const result = claimEvidenceSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject files missing required metadata', () => {
      const result = claimEvidenceSchema.safeParse({
        files: [{ name: 'bad.pdf' }],
      });
      expect(result.success).toBe(false);
    });

    it('should default classification to pii when omitted', () => {
      const result = claimEvidenceSchema.safeParse({
        files: [
          {
            id: 'file-1',
            name: 'photo.jpg',
            path: 'pii/claims/user/photo.jpg',
            type: 'image/jpeg',
            size: 2048,
            bucket: 'claim-evidence',
          },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files[0].classification).toBe('pii');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMBINED SCHEMA TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('createClaimSchema', () => {
    const validClaim = {
      category: 'retail',
      title: 'Defective product refund',
      companyName: 'Test Company',
      description: 'I purchased a product that was defective and want a refund.',
      claimAmount: '250.00',
      currency: 'EUR',
      files: [
        {
          id: 'file-1',
          name: 'receipt.pdf',
          path: 'pii/claims/user123/receipt.pdf',
          type: 'application/pdf',
          size: 1024,
          bucket: 'claim-evidence',
          classification: 'pii',
        },
      ],
    };

    it('should accept a valid complete claim', () => {
      const result = createClaimSchema.safeParse(validClaim);
      expect(result.success).toBe(true);
    });

    it('should reject claim missing required category', () => {
      const { category: removedCategory, ...claimWithoutCategory } = validClaim;
      void removedCategory;
      const result = createClaimSchema.safeParse(claimWithoutCategory);
      expect(result.success).toBe(false);
    });

    it('should reject claim missing required title', () => {
      const { title: removedTitle, ...claimWithoutTitle } = validClaim;
      void removedTitle;
      const result = createClaimSchema.safeParse(claimWithoutTitle);
      expect(result.success).toBe(false);
    });

    it('should reject claim missing required companyName', () => {
      const { companyName: removedCompanyName, ...claimWithoutCompany } = validClaim;
      void removedCompanyName;
      const result = createClaimSchema.safeParse(claimWithoutCompany);
      expect(result.success).toBe(false);
    });

    it('should reject claim missing required description', () => {
      const { description: removedDescription, ...claimWithoutDescription } = validClaim;
      void removedDescription;
      const result = createClaimSchema.safeParse(claimWithoutDescription);
      expect(result.success).toBe(false);
    });

    it('should accept claim without optional fields', () => {
      const minimalClaim = {
        category: 'retail',
        title: 'Valid title here',
        companyName: 'Company',
        description: 'This description is long enough to pass validation',
      };
      const result = createClaimSchema.safeParse(minimalClaim);
      expect(result.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    it('should handle unicode characters in title', () => {
      const result = claimDetailsSchema.safeParse({
        title: 'Rëklamë për produkt',
        companyName: 'Kompania Test',
        description: 'Përshkrimi me detaje të mjaftueshme',
      });
      expect(result.success).toBe(true);
    });

    it('should handle very long description', () => {
      const longDescription = 'A'.repeat(5000);
      const result = claimDetailsSchema.safeParse({
        title: 'Valid title',
        companyName: 'Company',
        description: longDescription,
      });
      expect(result.success).toBe(true);
    });

    it('should handle whitespace-only title', () => {
      const result = claimDetailsSchema.safeParse({
        title: '     ',
        companyName: 'Company',
        description: 'Valid description here with enough chars',
      });
      // Whitespace counts as characters, so 5 spaces should pass length but may fail business logic
      expect(result.success).toBe(true);
    });

    it('should handle special characters in company name', () => {
      const result = claimDetailsSchema.safeParse({
        title: 'Valid title here',
        companyName: 'Company & Co. (Ltd.)',
        description: 'Valid description here with enough chars',
      });
      expect(result.success).toBe(true);
    });
  });
});
