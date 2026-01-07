'use client';

import { getMessagesForClaim, sendMessage, type MessageWithSender } from '@/actions/messages';
import { isStaffOrAdmin } from '@/lib/roles';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@interdomestik/ui';
import { Loader2, MessageSquare, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

interface ClaimMessengerProps {
  claimId: string;
  currentUserId: string;
  userRole: 'admin' | 'staff' | 'agent' | 'user';
}

function getMessageStyle(isMe: boolean, isInternal: boolean) {
  if (isMe) {
    return 'bg-primary text-primary-foreground rounded-br-none';
  }
  if (isInternal) {
    return 'bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-bl-none';
  }
  return 'bg-muted rounded-bl-none';
}

export function ClaimMessenger({ claimId, currentUserId, userRole }: ClaimMessengerProps) {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const staffOrAdmin = isStaffOrAdmin(userRole);

  const fetchMessages = async () => {
    const result = await getMessagesForClaim(claimId);
    if (result.success && result.messages) {
      setMessages(result.messages);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [claimId]);

  useEffect(() => {
    // Scroll to bottom on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;

    startTransition(async () => {
      const content = newMessage;
      setNewMessage('');

      const result = await sendMessage(claimId, content, isInternal);
      if (!result.success) {
        toast.error('Failed to send message');
        // Refresh to revert
        fetchMessages();
      } else {
        // Refresh to get server timestamp
        fetchMessages();
      }
    });
  };

  return (
    <Card className="h-[600px] flex flex-col" data-testid="messaging-panel">
      <CardHeader className="flex flex-row items-center justify-between py-3 border-b">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Messages
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => fetchMessages()} disabled={isPending}>
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
          {isLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No messages yet.</p>
          ) : (
            <div className="space-y-4">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] ${
                    msg.senderId === currentUserId ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      {msg.sender.name}
                    </span>
                    {msg.isInternal && (
                      <span className="flex items-center gap-0.5 text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full border border-yellow-200">
                        <ShieldAlert className="h-3 w-3" />
                        Internal
                      </span>
                    )}
                  </div>
                  <div
                    className={`px-4 py-2 rounded-lg text-sm ${getMessageStyle(
                      msg.senderId === currentUserId,
                      msg.isInternal
                    )}`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : 'Just now'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-background">
          {staffOrAdmin && (
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant={isInternal ? 'default' : 'outline'}
                size="sm"
                className={`gap-2 h-7 text-xs ${isInternal ? 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-600' : ''}`}
                onClick={() => setIsInternal(!isInternal)}
                data-testid="internal-note-toggle"
              >
                <ShieldAlert className="h-3 w-3" />
                {isInternal ? 'Internal Note' : 'Public Message'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {isInternal ? 'Only visible to Staff & Admin' : 'Visible to Member, Staff & Admin'}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder={isInternal ? 'Add an internal note...' : 'Type a message...'}
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={isPending}
            />
            <Button onClick={handleSend} disabled={!newMessage.trim() || isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
