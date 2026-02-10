import { describe, expect, it } from 'vitest';

import { getRoleLabel } from './roles-i18n';

describe('getRoleLabel', () => {
  it('returns translated label when role key exists', () => {
    const translator = Object.assign((key: string) => (key === 'roles.agent' ? 'Agent' : key), {
      has: (key: string) => key === 'roles.agent',
    });

    expect(getRoleLabel(translator, 'agent')).toBe('Agent');
  });

  it('falls back to raw role when translation key is missing', () => {
    const translator = (key: string) => key;
    expect(getRoleLabel(translator, 'promoter')).toBe('promoter');
  });

  it('does not throw when translator throws for missing keys', () => {
    const translator = (key: string) => {
      if (key === 'roles.promoter') throw new Error('MISSING_MESSAGE');
      return key;
    };

    expect(getRoleLabel(translator, 'promoter')).toBe('promoter');
  });
});
