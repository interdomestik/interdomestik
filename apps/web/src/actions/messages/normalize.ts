import type { MessageWithSender, SelectedMessageRow } from './types';

export function normalizeSelectedMessages(rows: SelectedMessageRow[]): MessageWithSender[] {
  return rows.map(m => ({
    id: m.id,
    claimId: m.claimId,
    senderId: m.senderId,
    content: m.content,
    isInternal: m.isInternal ?? false,
    readAt: m.readAt,
    createdAt: m.createdAt ?? new Date(),
    sender: {
      id: m.sender?.id ?? m.senderId,
      name: m.sender?.name ?? 'Unknown',
      image: m.sender?.image ?? null,
      role: m.sender?.role ?? 'user',
    },
  }));
}
