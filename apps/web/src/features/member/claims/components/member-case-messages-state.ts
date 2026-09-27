'use client';

import {
  getMessagesForClaim,
  markMessagesAsRead,
  sendMessage,
  type MessageWithSender,
} from '@/actions/messages';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Mounted only within a keyed case panel: drafts and acknowledgements never cross cases. */
export function useMemberCaseMessages(claimId: string, userId: string) {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const mounted = useRef(false);
  const request = useRef(0);
  const fetching = useRef(false);
  const sendLock = useRef(false);
  const acknowledged = useRef(new Map<string, MessageWithSender>());
  const publicMessage = useCallback(
    (message: MessageWithSender) => message.claimId === claimId && message.isInternal === false,
    [claimId]
  );

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    const sequence = ++request.current;
    fetching.current = true;
    const current = () => mounted.current && sequence === request.current;
    setLoading(true);
    setLoadError(false);
    setReadError(false);
    try {
      const result = await getMessagesForClaim(claimId);
      if (!current()) return;
      if (!result.success || !result.messages) {
        setLoadError(true);
        return;
      }
      const visible = result.messages.filter(message => publicMessage(message));
      const merged = new Map(visible.map(message => [message.id, message]));
      acknowledged.current.forEach((message, id) => {
        if (!merged.has(id)) merged.set(id, message);
      });
      setMessages(
        [...merged.values()].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      );
      const unread = visible.filter(message => message.senderId !== userId && !message.readAt);
      if (unread.length) {
        try {
          const read = await markMessagesAsRead(unread.map(message => message.id));
          if (current()) setReadError(!read.success);
        } catch {
          if (current()) setReadError(true);
        }
      }
    } catch {
      if (current()) setLoadError(true);
    } finally {
      if (current()) {
        fetching.current = false;
        setLoading(false);
      }
    }
  }, [claimId, publicMessage, userId]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden' && !fetching.current) void refresh();
    }, 30_000);
    return () => {
      clearInterval(interval);
      fetching.current = false;
      mounted.current = false;
      request.current++;
    };
  }, [refresh]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    setSendStatus('idle');
    try {
      const result = await sendMessage(claimId, content, false);
      if (!mounted.current) return;
      if (!result.success) {
        setSendStatus('error');
        return;
      }
      if (result.message && publicMessage(result.message)) {
        const message = result.message;
        acknowledged.current.set(message.id, message);
        setMessages(previous => [...previous.filter(item => item.id !== message.id), message]);
      }
      setDraft('');
      setSendStatus('sent');
      setSentCount(count => count + 1);
      void refresh();
    } catch {
      if (mounted.current) setSendStatus('error');
    } finally {
      sendLock.current = false;
      if (mounted.current) setSending(false);
    }
  };

  return {
    messages,
    draft,
    setDraft,
    loading,
    loadError,
    readError,
    sending,
    sendStatus,
    sentCount,
    refresh,
    send,
  };
}
