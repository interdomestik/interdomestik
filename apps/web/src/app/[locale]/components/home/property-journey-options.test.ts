import { describe, expect, it } from 'vitest';
import {
  PROPERTY_DAMAGE_TYPES,
  PROPERTY_ROLES,
  getPropertyGuidanceKeys,
} from './property-journey-options';

describe('property journey branching', () => {
  it.each(PROPERTY_DAMAGE_TYPES)('keeps a specific safe result for %s', damageType => {
    expect(getPropertyGuidanceKeys(damageType, 'no', 'owner')).toContain(`type.${damageType}`);
  });

  it.each(PROPERTY_ROLES)('keeps role-specific possible contacts for %s', role => {
    expect(getPropertyGuidanceKeys('other', 'no', role)).toContain(`role.${role}`);
  });

  it.each(['yes', 'unsure'] as const)('adds a neutral third-party note for %s', answer => {
    expect(getPropertyGuidanceKeys('water', answer, 'tenant')).toContain('thirdParty');
  });

  it('does not infer a third party when the answer is no', () => {
    expect(getPropertyGuidanceKeys('water', 'no', 'tenant')).not.toContain('thirdParty');
  });
});
