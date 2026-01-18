import type { ReactNode } from 'react';

export type OpsDocument = {
  id: string;
  name: string;
  url?: string;
  uploadedAt?: Date | string;
  uploadedBy?: string;
};

export type OpsTimelineEvent = {
  id: string;
  title: string;
  description?: string;
  date: string;
  actorName?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

export type OpsAction = {
  id?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  visible?: boolean;
  variant?: 'default' | 'outline' | 'destructive' | 'ghost';
  icon?: ReactNode;
  testId?: string;
};
