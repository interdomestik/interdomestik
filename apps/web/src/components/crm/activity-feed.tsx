'use client';

import { Badge } from '@interdomestik/ui/components/badge';
import { formatDistanceToNow } from 'date-fns';
import { Calendar, Mail, MessageSquare, Phone, StickyNote } from 'lucide-react';

type Activity = {
  id: string;
  type: string;
  subject: string;
  description: string | null;
  occurredAt: Date | string | null;
  createdAt: Date | string | null;
  agent?: {
    name: string | null;
  } | null;
};

interface ActivityFeedProps {
  activities: Activity[];
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'call':
      return <Phone className="h-4 w-4" />;
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'meeting':
      return <Calendar className="h-4 w-4" />;
    case 'note':
      return <StickyNote className="h-4 w-4" />;
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'call':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'email':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'meeting':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case 'note':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }
};

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (!activities || activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <MessageSquare className="mb-2 h-10 w-10 opacity-20" />
        <p>No activities recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="h-[400px] overflow-y-auto pr-4">
      <div className="space-y-6">
        {activities.map((activity, index) => (
          <div key={activity.id} className="relative flex gap-4">
            {/* Timeline connector */}
            {index !== activities.length - 1 && (
              <div className="absolute left-[19px] top-8 h-full w-px bg-border" />
            )}

            {/* Icon */}
            <div
              className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${getActivityColor(activity.type)}`}
              >
                {getActivityIcon(activity.type)}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{activity.subject}</span>
                  <Badge variant="outline" className="text-xs capitalize">
                    {activity.type}
                  </Badge>
                </div>
                <time className="text-xs text-muted-foreground">
                  {activity.occurredAt
                    ? formatDistanceToNow(new Date(activity.occurredAt as string | Date), {
                        addSuffix: true,
                      })
                    : 'Unknown time'}
                </time>
              </div>

              {activity.description && (
                <div className="text-sm text-muted-foreground">
                  <div className="whitespace-pre-wrap">{activity.description}</div>
                </div>
              )}

              <div className="pt-1 text-xs text-muted-foreground">
                Logged by{' '}
                <span className="font-medium text-foreground">
                  {activity.agent?.name || 'Agent'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
