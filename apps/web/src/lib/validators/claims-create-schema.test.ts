import { createClaimSchema } from '@/lib/validators/claims';
import { describe, expect, it } from 'vitest';

describe('Claim Validators', () => {
  describe('createClaimSchema', () => {
    const validClaim = {
      category: 'property',
      title: 'Defective product refund',
      companyName: 'Test Company',
      description: 'I purchased a product that was defective and want a refund.',
      claimAmount: '250.00',
      currency: 'EUR',
      files: [
        {
          id: 'file-1',
          name: 'receipt.pdf',
          path: 'pii/tenants/tenant_mk/claims/user123/receipt.pdf',
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
      expect(result.error?.issues.map(issue => issue.path[0])).toEqual(['category']);
    });

    it('should reject claim missing required title', () => {
      const { title: removedTitle, ...claimWithoutTitle } = validClaim;
      void removedTitle;
      const result = createClaimSchema.safeParse(claimWithoutTitle);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map(issue => issue.path[0])).toEqual(['title']);
    });

    it('should reject claim missing required companyName', () => {
      const { companyName: removedCompanyName, ...claimWithoutCompany } = validClaim;
      void removedCompanyName;
      const result = createClaimSchema.safeParse(claimWithoutCompany);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map(issue => issue.path[0])).toEqual(['companyName']);
    });

    it('should reject claim missing required description', () => {
      const { description: removedDescription, ...claimWithoutDescription } = validClaim;
      void removedDescription;
      const result = createClaimSchema.safeParse(claimWithoutDescription);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map(issue => issue.path[0])).toEqual(['description']);
    });

    it('should accept claim without optional fields', () => {
      const minimalClaim = {
        category: 'property',
        title: 'Valid title here',
        companyName: 'Company',
        description: 'This description is long enough to pass validation',
      };
      const result = createClaimSchema.safeParse(minimalClaim);
      expect(result.success).toBe(true);
    });
  });
});
