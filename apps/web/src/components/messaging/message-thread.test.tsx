vi.unmock('next-intl');
vi.mock('../../i18n/routing', () => ({ routing: { defaultLocale: 'sq' } }));
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_NAMESPACES,
  APP_NAMESPACES,
  STAFF_NAMESPACES,
  loadAllMessages,
  pickMessages,
} from '../../i18n/messages';
import enCommon from '../../messages/en/common.json';
import enMessaging from '../../messages/en/messaging.json';
import mkCommon from '../../messages/mk/common.json';
import mkMessaging from '../../messages/mk/messaging.json';
import sqCommon from '../../messages/sq/common.json';
import sqMessaging from '../../messages/sq/messaging.json';
import srCommon from '../../messages/sr/common.json';
import srMessaging from '../../messages/sr/messaging.json';
import { MessageThread } from './message-thread';

const CATALOGS = {
  en: { ...enCommon, ...enMessaging },
  sq: { ...sqCommon, ...sqMessaging },
  mk: { ...mkCommon, ...mkMessaging },
  sr: { ...srCommon, ...srMessaging },
};

type Locale = keyof typeof CATALOGS;
type ThreadProps = Parameters<typeof MessageThread>[0];

function renderThread(
  props: ThreadProps,
  locale: Locale = 'en',
  messages: AbstractIntlMessages = CATALOGS[locale] as unknown as AbstractIntlMessages,
  onError?: () => void
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} onError={onError}>
      <MessageThread {...props} />
    </NextIntlClientProvider>
  );
}

const en = CATALOGS.en;

// isStaffOrAdmin accepts exactly these four roles; branch_manager is deliberately not one of them.
const ACCEPTED_ROLES = ['staff', 'admin', 'tenant_admin', 'super_admin'] as const;
const NON_BADGE_ROLES = ['member', 'user', 'branch_manager', 'unknown_role'];
const SUBSETS = { member: APP_NAMESPACES, agent: AGENT_NAMESPACES, staff: STAFF_NAMESPACES };
type Portal = keyof typeof SUBSETS;
const LOCALES = Object.keys(CATALOGS) as Locale[];
const PORTALS = Object.keys(SUBSETS) as Portal[];
const RAW_KEY = /MISSING_MESSAGE|common\.roles\.|messaging\./;
const picked = new Map<string, AbstractIntlMessages>();

function subset(locale: Locale, portal: Portal): AbstractIntlMessages {
  const messages = picked.get(`${locale}:${portal}`);
  if (!messages) throw new Error(`missing picked subset ${locale}:${portal}`);
  return messages;
}

const mockMessages = [
  {
    id: 'msg-1',
    claimId: 'claim-1',
    senderId: 'user-1',
    content: 'Hello, I need help with my claim',
    isInternal: false,
    readAt: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    sender: {
      id: 'user-1',
      name: 'John Doe',
      image: null,
      role: 'user',
    },
  },
  {
    id: 'msg-2',
    claimId: 'claim-1',
    senderId: 'agent-1',
    content: 'Hi John, I am here to help',
    isInternal: false,
    readAt: new Date('2024-01-15T10:05:00Z'),
    createdAt: new Date('2024-01-15T10:05:00Z'),
    sender: {
      id: 'agent-1',
      name: 'Agent Smith',
      image: 'https://example.com/avatar.jpg',
      role: 'agent',
    },
  },
  {
    id: 'msg-3',
    claimId: 'claim-1',
    senderId: 'agent-1',
    content: 'This is an internal note',
    isInternal: true,
    readAt: null,
    createdAt: new Date('2024-01-15T10:10:00Z'),
    sender: {
      id: 'agent-1',
      name: 'Agent Smith',
      image: null,
      role: 'agent',
    },
  },
];

const memberViewer = { id: 'user-1', name: 'User', image: null, role: 'user' };

function senderMessage(role: string) {
  return [
    {
      ...mockMessages[1],
      id: 'msg-role',
      content: 'Reply body',
      sender: { ...mockMessages[1].sender, name: 'Sender Name', role },
    },
  ];
}

describe('MessageThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeAll(async () => {
    for (const locale of LOCALES) {
      const all = await loadAllMessages(locale);
      for (const portal of PORTALS) {
        picked.set(
          `${locale}:${portal}`,
          pickMessages(all, SUBSETS[portal]) as AbstractIntlMessages
        );
      }
    }
  }, 120_000);

  it('renders empty state when no messages', () => {
    renderThread({ messages: [], currentUser: memberViewer });

    expect(screen.getByText(en.messaging.empty.title)).toBeInTheDocument();
    expect(screen.getByText(en.messaging.empty.description)).toBeInTheDocument();
  });

  it('renders messages from different senders', () => {
    renderThread({ messages: mockMessages, currentUser: memberViewer });

    expect(screen.getByText('Hello, I need help with my claim')).toBeInTheDocument();
    expect(screen.getByText('Hi John, I am here to help')).toBeInTheDocument();
  });

  it('shows agent badge for agent messages', () => {
    renderThread({ messages: mockMessages, currentUser: memberViewer });

    // Multiple agent messages may show multiple badges
    const badges = screen.getAllByText(en.messaging.agentBadge);
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows sender name for other users messages', () => {
    renderThread({ messages: mockMessages, currentUser: memberViewer });

    // Agent Smith appears multiple times (for each message)
    const names = screen.getAllByText('Agent Smith');
    expect(names.length).toBeGreaterThan(0);
  });

  it('shows internal note indicator for agents', () => {
    renderThread({ messages: mockMessages, currentUser: memberViewer, isAgent: true });

    expect(screen.getByText(en.messaging.internalNote)).toBeInTheDocument();
    expect(screen.getByText('This is an internal note')).toBeInTheDocument();
  });

  it('shows internal note indicator for staff viewers without agent quick-reply mode', () => {
    renderThread({
      messages: mockMessages,
      currentUser: { id: 'staff-1', name: 'Staff User', image: null, role: 'staff' },
    });

    expect(screen.getByText(en.messaging.internalNote)).toBeInTheDocument();
  });

  it('shows user initials in avatar fallback', () => {
    renderThread({ messages: mockMessages, currentUser: memberViewer });

    // Agent Smith's messages should show 'A' for first letter
    const initials = screen.getAllByText('A');
    expect(initials.length).toBeGreaterThan(0);
  });

  it('shows message timestamps', () => {
    renderThread({ messages: mockMessages, currentUser: memberViewer });

    // Messages have time displayed
    const timeElements = screen.getAllByText(/\d{1,2}:\d{2}/);
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('renders deterministic UTC date headers', () => {
    renderThread({ messages: mockMessages, currentUser: memberViewer });

    expect(screen.getByText('15/01/2024 UTC')).toBeInTheDocument();
  });

  it('shows read indicator for own read messages', () => {
    const messagesWithRead = [
      {
        ...mockMessages[0],
        readAt: new Date(),
      },
    ];

    renderThread({ messages: messagesWithRead, currentUser: memberViewer });

    // Check mark should be shown for read messages
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  describe.each(LOCALES)('sender role badge (%s)', locale => {
    const { messaging, common } = CATALOGS[locale];

    it.each(ACCEPTED_ROLES)('labels a %s sender by role, not as agent', role => {
      renderThread({ messages: senderMessage(role), currentUser: memberViewer }, locale);

      expect(screen.getByText(common.roles[role])).toBeInTheDocument();
      expect(screen.queryByText(messaging.agentBadge)).not.toBeInTheDocument();
    });

    it('keeps the agent badge for an actual agent sender', () => {
      renderThread({ messages: senderMessage('agent'), currentUser: memberViewer }, locale);

      expect(screen.getByText(messaging.agentBadge)).toBeInTheDocument();
      expect(screen.queryByText(common.roles.staff)).not.toBeInTheDocument();
    });

    it.each(NON_BADGE_ROLES)('shows no role badge for a %s sender', role => {
      renderThread({ messages: senderMessage(role), currentUser: memberViewer }, locale);

      expect(screen.getByText('Reply body')).toBeInTheDocument();
      expect(screen.queryByText(messaging.agentBadge)).not.toBeInTheDocument();
      expect(screen.queryByText(common.roles.staff)).not.toBeInTheDocument();
      expect(screen.queryByText(common.roles.member)).not.toBeInTheDocument();
    });
  });

  describe.each(LOCALES)('portal catalog subsets (%s)', locale => {
    const { messaging, common } = CATALOGS[locale];

    describe.each(PORTALS)('%s portal', portal => {
      const renderPortal = (role: string) => {
        const onError = vi.fn();
        const props = { messages: senderMessage(role), currentUser: memberViewer };
        renderThread(props, locale, subset(locale, portal), onError);
        expect(onError).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toMatch(RAW_KEY);
      };

      it('retains the common and messaging namespaces', () => {
        const messages = subset(locale, portal) as unknown as {
          common: { roles: Record<string, string> };
          messaging: Record<string, string>;
        };
        for (const role of ACCEPTED_ROLES) {
          expect(messages.common.roles[role]).toBe(common.roles[role]);
        }
        expect(messages.messaging.agentBadge).toBe(messaging.agentBadge);
        expect(messages.messaging.internalNote).toBe(messaging.internalNote);
      });

      it.each(ACCEPTED_ROLES)('renders the localized label for a %s sender', role => {
        renderPortal(role);

        expect(screen.getByText(common.roles[role])).toBeInTheDocument();
        expect(screen.queryByText(messaging.agentBadge)).not.toBeInTheDocument();
      });

      it('keeps the agent badge for an agent sender', () => {
        renderPortal('agent');

        expect(screen.getByText(messaging.agentBadge)).toBeInTheDocument();
        expect(screen.queryByText(common.roles.staff)).not.toBeInTheDocument();
      });

      it.each(NON_BADGE_ROLES)('shows no role badge for a %s sender', role => {
        renderPortal(role);

        expect(screen.getByText('Reply body')).toBeInTheDocument();
        expect(screen.queryByText(messaging.agentBadge)).not.toBeInTheDocument();
        for (const label of Object.values(common.roles)) {
          expect(screen.queryByText(label)).not.toBeInTheDocument();
        }
      });
    });
  });
});
