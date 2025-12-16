'use client';

import { cn } from '@interdomestik/ui/lib/utils';
import {
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Gavel,
  History,
  Scale,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

interface ClaimTimelineProps {
  status: ClaimStatus;
  updatedAt: Date;
}

const PHASES = [
  {
    id: 'submitted',
    label: 'Submission',
    description: 'Claim received',
    icon: FileText,
  },
  {
    id: 'verification',
    label: 'Verification',
    description: 'Checking details',
    icon: FileCheck,
  },
  {
    id: 'evaluation',
    label: 'Evaluation',
    description: 'Assessing value',
    icon: Scale,
  },
  {
    id: 'negotiation',
    label: 'Negotiation',
    description: 'Offer sent',
    icon: History, // Or Handshake if available? using History as placeholder for "process"
  },
  {
    id: 'court',
    label: 'Court',
    description: 'Legal proceedings',
    icon: Gavel,
    optional: true, // This step might be skipped
  },
  {
    id: 'resolved',
    label: 'Resolution',
    description: 'Final decision',
    icon: CheckCircle2,
  },
];

export function ClaimTimeline({ status, updatedAt }: ClaimTimelineProps) {
  const t = useTranslations('timeline');
  // If rejected, we show a special state but map it to 'resolved' visually or distinct
  const isRejected = status === 'rejected';
  const updatedAtDate = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);

  // Find current phase index
  // Note: 'draft' is before submission (-1)
  let currentIndex = PHASES.findIndex(p => p.id === status);
  if (status === 'draft') currentIndex = -1;
  if (isRejected) currentIndex = PHASES.length - 1; // Show formatted as final but red

  // SLA placeholder: mark at-risk if last update older than 48h and not resolved/rejected
  const hoursSinceUpdate = (Date.now() - updatedAtDate.getTime()) / (1000 * 60 * 60);
  const isAtRisk = hoursSinceUpdate > 48 && !['resolved', 'rejected'].includes(status);

  // Handle distinct "Court" skipping logic later if needed
  // For now, linear progress

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <Clock className="h-4 w-4 text-[hsl(var(--primary))]" />
          <span>{t('nextSla', { target: '<24h' })}</span>
        </div>
        {isAtRisk && (
          <span className="text-xs px-2 py-1 rounded-full bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]">
            {t('atRisk')}
          </span>
        )}
      </div>
      <div className="absolute left-4 top-0 h-full w-0.5 bg-[hsl(var(--muted))]" />

      <div className="space-y-8">
        {PHASES.map((phase, index) => {
          const Icon = phase.icon;
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          let stateColor = 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';

          if (isCompleted) {
            stateColor = 'bg-[hsl(var(--primary))] text-white';
          } else if (isCurrent) {
            stateColor = isRejected
              ? 'bg-[hsl(var(--destructive))] text-white'
              : 'bg-[hsl(var(--primary))] text-white';
          }

          return (
            <div key={phase.id} className="relative flex gap-6">
              {/* Connector Line Cover (for clean segments) */}

              {/* Icon Marker */}
              <div
                className={cn(
                  'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300',
                  isCompleted || isCurrent
                    ? 'border-transparent'
                    : 'border-[hsl(var(--muted-foreground))]/20 bg-[hsl(var(--background))]',
                  stateColor
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : isCurrent && isRejected ? (
                  <XCircle className="h-5 w-5" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>

              {/* Content */}
              <div
                className={cn(
                  'flex flex-col pt-1 transition-opacity duration-300',
                  index > currentIndex + 1 ? 'opacity-50' : 'opacity-100'
                )}
              >
                <span
                  className={cn(
                    'text-sm font-medium leading-none',
                    isCurrent && 'text-[hsl(var(--primary))]'
                  )}
                >
                  {phase.label}
                </span>
                <span className="text-sm text-[hsl(var(--muted-foreground))]">
                  {phase.description}
                </span>
                {isCurrent && (
                  <span className="mt-1 flex items-center text-xs text-[hsl(var(--muted-foreground))]">
                    <Clock className="mr-1 h-3 w-3" />
                    {t('updatedAt', { date: updatedAtDate.toLocaleDateString() })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
