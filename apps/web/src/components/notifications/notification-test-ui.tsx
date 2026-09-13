import notifications from '@/messages/en/notifications.json';
import common from '@/messages/en/common.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

interface NotificationUiMockOptions {
  withOpenControl?: boolean;
}

export function createNotificationTranslationsMock() {
  return {
    useTranslations: createUseTranslationsMock(() => ({ ...notifications, ...common })),
  };
}

export function createNotificationUiMock({
  withOpenControl = false,
}: NotificationUiMockOptions = {}) {
  return {
    Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Button: ({
      children,
      ...props
    }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
      <button {...props}>{children}</button>
    ),
    DropdownMenu: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div>
        {withOpenControl ? <button onClick={() => onOpenChange?.(true)}>Open menu</button> : null}
        {children}
      </div>
    ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
