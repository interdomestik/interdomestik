import { describe, expect, it, vi } from 'vitest';

import { consoleErrorFilterTestHooks, installConsoleErrorFilter } from './console-error-filter';

describe('installConsoleErrorFilter', () => {
  it('suppresses expected React test warnings without logging raw text', () => {
    const calls: unknown[][] = [];
    const target = { error: (...args: unknown[]) => calls.push(args) } as unknown as Console;

    installConsoleErrorFilter(target);
    target.error('Warning: ReactDOM.render contains apiKey=secret-test-value');

    expect(calls).toEqual([]);
  });

  it('redacts unexpected console.error arguments', () => {
    const calls: unknown[][] = [];
    const target = { error: (...args: unknown[]) => calls.push(args) } as unknown as Console;

    installConsoleErrorFilter(target);
    target.error('apiKey=secret-test-value', { password: 'also-secret' });

    expect(calls).toEqual([[consoleErrorFilterTestHooks.REDACTED_CONSOLE_ERROR]]);
    expect(JSON.stringify(calls)).not.toContain('secret-test-value');
    expect(JSON.stringify(calls)).not.toContain('also-secret');
  });

  it('keeps explicit test spies in control of console assertions', () => {
    const error = vi.fn();
    const target = { error } as unknown as Console;

    installConsoleErrorFilter(target);
    target.error('RATE_LIMIT_BACKEND_MISSING', { reason: 'missing_env' });

    expect(error).toHaveBeenCalledWith('RATE_LIMIT_BACKEND_MISSING', {
      reason: 'missing_env',
    });
  });
});
