import { describe, expect, it } from 'vitest';

import { actionFailure, defaultFailureMessage, toActionError } from './safe-action.failure';

describe('failure messages', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'a code named like an Object.prototype member gets the plain fallback: %s (r3 B17)',
    code => {
      expect(defaultFailureMessage(code)).toBe('Request failed');
      const error = toActionError(actionFailure(code));
      expect(error.error).toBe('Request failed');
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        success: false,
        error: 'Request failed',
        code,
      });
    }
  );

  it('a known code keeps its fixed message', () => {
    expect(toActionError(actionFailure('FORBIDDEN')).error).toBe('Forbidden');
  });
});
