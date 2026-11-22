import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { claimCategorySchema } from '../validators/claims';
import { isClaimCategoryOpenForIntake, OPEN_CLAIM_CATEGORY_IDS } from './intake-category';

describe('claim intake categories', () => {
  it.each(['vehicle', 'property', 'travel'])('accepts and normalizes %s', category => {
    const input = `\t${category.toUpperCase()}\u00a0`;
    expect(isClaimCategoryOpenForIntake(input)).toBe(true);
    expect(claimCategorySchema.parse({ category: input })).toEqual({ category });
  });

  it.each(['injury', 'invalidity', 'Personal Injury', 'other', 'retail', '  ', null])(
    'refuses %s',
    category => {
      expect(isClaimCategoryOpenForIntake(category)).toBe(false);
      expect(claimCategorySchema.safeParse({ category }).success).toBe(false);
    }
  );

  it('uses the same open ids as the database intake rule', () => {
    const drizzle = new URL('../../../database/drizzle/', import.meta.url);
    const [registerFile, ...others] = readdirSync(drizzle).filter(name =>
      name.endsWith('_wp12_claim_correspondence.sql')
    );
    expect(registerFile).toBeDefined();
    expect(others).toEqual([]);
    const migration = readFileSync(new URL(registerFile, drizzle), 'utf8');
    const sqlOpenSet = migration.match(
      /\bfunction\s+public\.claim_category_open_for_intake\s*\([^)]*\)[\s\S]*?\)\s+in\s*\(([^)]*)\)/i
    );
    expect(sqlOpenSet).not.toBeNull();
    const sqlOpenIds = [...(sqlOpenSet?.[1] ?? '').matchAll(/'([^']+)'/g)].map(match => match[1]);
    expect(sqlOpenIds).toHaveLength(OPEN_CLAIM_CATEGORY_IDS.size);
    expect(new Set(sqlOpenIds)).toEqual(new Set(OPEN_CLAIM_CATEGORY_IDS));
  });
});
