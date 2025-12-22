import { NoteType } from '@/actions/member-notes';
import { AlertCircle, Calendar, Mail, MessageCircle, Phone, Users } from 'lucide-react';
import { ReactNode } from 'react';

export const noteTypeIcons: Record<NoteType, ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  meeting: <Users className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  general: <MessageCircle className="h-4 w-4" />,
  follow_up: <Calendar className="h-4 w-4" />,
  issue: <AlertCircle className="h-4 w-4" />,
};

export const noteTypeColors: Record<NoteType, string> = {
  call: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  meeting: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  email: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  general: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
  follow_up: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  issue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const noteTypes: NoteType[] = ['general', 'call', 'meeting', 'email', 'follow_up', 'issue'];
