interface NotificationFeedbackProps {
  readonly statusMessage: string;
  readonly errorMessage: string | null;
}

export function NotificationFeedback({ statusMessage, errorMessage }: NotificationFeedbackProps) {
  return (
    <>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </p>
      {errorMessage ? (
        <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
