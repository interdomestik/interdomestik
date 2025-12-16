import { describe, expect, it } from 'vitest';
import { changePasswordSchema } from './auth';
import { profileSchema } from './profile';

describe('Validation Schemas', () => {
  describe('changePasswordSchema', () => {
    it('should validate matching passwords', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
        confirmPassword: 'new-password-123',
      });
      expect(result.success).toBe(true);
    });

    it('should fail if passwords do not match', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
        confirmPassword: 'mismatching-password',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Passwords do not match');
      }
    });

    it('should fail if password is too short', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'short',
        confirmPassword: 'short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 8 characters');
      }
    });

    it('should fail if fields are missing', () => {
      const result = changePasswordSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('profileSchema', () => {
    it('should validate valid profile', () => {
      const result = profileSchema.safeParse({
        name: 'John Doe',
        image: 'https://example.com/avatar.jpg',
      });
      expect(result.success).toBe(true);
    });

    it('should validate profile with empty image', () => {
      const result = profileSchema.safeParse({
        name: 'John Doe',
        image: '',
      });
      expect(result.success).toBe(true);
    });

    it('should validate profile without image (optional)', () => {
      const result = profileSchema.safeParse({
        name: 'John Doe',
      });
      expect(result.success).toBe(true);
    });

    it('should fail if name is too short', () => {
      const result = profileSchema.safeParse({
        name: 'J',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2 characters');
      }
    });

    it('should fail if image is invalid URL', () => {
      const result = profileSchema.safeParse({
        name: 'John Doe',
        image: 'not-a-url',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid image URL');
      }
    });
  });
});
