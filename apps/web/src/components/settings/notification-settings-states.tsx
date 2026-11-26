'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { Bell } from 'lucide-react';

type HeaderCopy = Readonly<{ title: string; description: string }>;

function NotificationSettingsHeader({ title, description }: HeaderCopy) {
  return (
    <CardHeader>
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 shrink-0 text-muted-foreground" />
        <CardTitle className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
          {title}
        </CardTitle>
      </div>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

const CARD = 'border-border/50 bg-card/30 backdrop-blur-md shadow-premium relative overflow-hidden';

/** While the stored preferences are read: no toggles and no Save. */
export function NotificationSettingsLoading(copy: HeaderCopy) {
  return (
    <Card className={CARD}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
      <NotificationSettingsHeader {...copy} />
      <CardContent>
        <div className="space-y-4">
          <div className="h-20 bg-muted/20 animate-pulse rounded" />
          <div className="h-20 bg-muted/20 animate-pulse rounded" />
          <div className="h-20 bg-muted/20 animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

type UnavailableProps = HeaderCopy &
  Readonly<{ message: string; retryLabel: string; onRetry: () => void }>;

/**
 * A failed or rejected read (fail closed, R-08 and R-23): no toggles and no Save, so defaults can never be
 * saved over the member's stored choices. Retry reads the stored preferences again.
 */
export function NotificationSettingsUnavailable({
  message,
  retryLabel,
  onRetry,
  ...copy
}: UnavailableProps) {
  return (
    <Card className={CARD}>
      <NotificationSettingsHeader {...copy} />
      <CardContent className="space-y-4" data-testid="notification-settings-unavailable">
        <p role="alert" className="text-sm">
          {message}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="h-auto min-h-11 max-w-full whitespace-normal"
        >
          {retryLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
