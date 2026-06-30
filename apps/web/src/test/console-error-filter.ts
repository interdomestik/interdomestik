const REDACTED_CONSOLE_ERROR =
  '[test-console-error] unexpected console.error omitted raw arguments';

function isExpectedConsoleError(args: readonly unknown[]): boolean {
  const message = args[0];
  return (
    typeof message === 'string' &&
    (message.includes('Warning: ReactDOM.render') || message.includes('act(...)'))
  );
}

function isMockFunction(candidate: unknown): boolean {
  return (
    typeof candidate === 'function' &&
    (Boolean((candidate as { _isMockFunction?: boolean })._isMockFunction) ||
      typeof (candidate as { mock?: unknown }).mock === 'object')
  );
}

export function installConsoleErrorFilter(target: Pick<Console, 'error'> = console): void {
  if (isMockFunction(target.error)) return;

  const originalError = target.error.bind(target);
  target.error = (...args: unknown[]) => {
    if (isExpectedConsoleError(args)) return;
    originalError(REDACTED_CONSOLE_ERROR);
  };
}

export const consoleErrorFilterTestHooks = {
  REDACTED_CONSOLE_ERROR,
  isExpectedConsoleError,
};
