import { Badge, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Calendar, CheckCircle2, Circle, Clock } from 'lucide-react';

type TimelineEvent = {
  id: string;
  type: 'status_change' | 'document_upload' | 'message' | 'created';
  title: string;
  description?: string;
  timestamp: Date;
  status?: string;
};

export function ClaimTimeline({ claimCreatedAt }: { claimCreatedAt: Date }) {
  // Mock timeline for now - in the future this will come from claim_timeline table
  const events: TimelineEvent[] = [
    {
      id: '1',
      type: 'created',
      title: 'Claim Created',
      description: 'Your claim has been successfully submitted',
      timestamp: claimCreatedAt,
      status: 'draft',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.map((event, index) => (
            <div key={event.id} className="flex gap-4">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  {index === 0 ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </div>
                {index < events.length - 1 && (
                  <div className="w-px flex-1 bg-border mt-2 min-h-[40px]" />
                )}
              </div>

              {/* Event content */}
              <div className="flex-1 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">{event.title}</h4>
                    {event.description && (
                      <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                    )}
                    {event.status && (
                      <Badge variant="outline" className="mt-2 capitalize">
                        {event.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <time suppressHydrationWarning>
                      {event.timestamp.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </time>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {events.length === 1 && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground text-center">
              📋 Your claim is being reviewed. Updates will appear here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
