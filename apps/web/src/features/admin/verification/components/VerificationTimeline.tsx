import { Clock, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { VerificationTimelineEvent } from '../server/types';

interface VerificationTimelineProps {
  timeline: VerificationTimelineEvent[];
}

export function VerificationTimeline({ timeline }: VerificationTimelineProps) {
  const t = useTranslations('admin.leads');

  return (
    <div className="space-y-3">
      <h4 className="font-medium flex items-center gap-2">
        <Clock className="w-4 h-4" /> {t('drawer.timeline')}
      </h4>
      <div className="border-l-2 border-muted ml-2 space-y-6 pl-4 py-2">
        {timeline.map(event => (
          <div key={event.id} className="relative">
            <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground/30 ring-4 ring-background" />
            <p className="text-sm font-medium">{event.title}</p>
            {event.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{new Date(event.date).toLocaleString()}</span>
              {event.actorName && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> {event.actorName}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
