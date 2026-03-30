import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const updateLeadStatus = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'columns.lead': 'Emri dhe email-i i lead-it',
      'columns.status': 'Statusi',
      'columns.details': 'Telefoni dhe dega',
      'columns.meta': 'Krijuar / kontakti i fundit',
      'tabs.all': 'Të gjithë lead-et',
      'tabs.new': 'Të reja',
      'tabs.in_progress': 'Në proces',
      'tabs.clients': 'Klientë',
      'tabs.lost': 'Humbur',
      title: 'Lead-et',
      subtitle: 'Menaxho dhe gjurmo të gjithë lead-et e tu.',
      search_placeholder: 'Kërko lead sipas emrit, email-it ose telefonit...',
      empty_title: 'Nuk u gjetën lead-e',
      empty_subtitle: 'Ndrysho filtrat ose kërkimin tënd.',
      empty_label: 'Asnjë lead nuk përputhet me filtrat',
      details: 'Detajet e lead-it',
      back_to_members: 'Kthehu te anëtarët',
      'fields.status': 'Statusi',
      'fields.created': 'Krijuar',
      'fields.updated': 'Përditësuar',
      'fields.email': 'E-mail',
      'fields.phone': 'Telefoni',
      'fields.source': 'Burimi',
      'fields.branch': 'Dega',
      'fields.notes': 'Shënime',
      'fields.next_step': 'Hapi tjetër',
      'statuses.payment_pending': 'Në pritje të pagesës',
      'statuses.new': 'Të reja',
      'statuses.contacted': 'I kontaktuar',
      'statuses.converted': 'I konvertuar',
      'statuses.lost': 'I humbur',
      'statuses.expired': 'I skaduar',
      'statuses.none': 'Asnjë',
      'actions.convert': 'Konverto në klient',
      'actions.mark_contacted': 'Shëno si i kontaktuar',
      'actions.pay_cash': 'Paguaj me para në dorë',
      'actions.mark_lost': 'Shëno si i humbur',
      more_actions: 'Më shumë veprime',
      'timeline.title': 'Kronologjia',
      'timeline.empty': 'Ende nuk ka ngjarje',
      'timeline.events.created.title': 'Lead-i u krijua',
      'timeline.events.created.source_prefix': 'Burimi:',
      'timeline.events.created.unknown_source': 'I panjohur',
      'timeline.events.converted.title': 'I konvertuar',
      'timeline.events.converted.description': 'Lead-i u konvertua në klient',
      'toasts.converted': 'Lead-i u konvertua me sukses',
      'toasts.marked_contacted': 'Lead-i u shënua si i kontaktuar',
      'toasts.payment_requested': 'Pagesa u kërkua',
      'toasts.marked_lost': 'Lead-i u shënua si i humbur',
      'toasts.action_failed': 'Veprimi dështoi',
    };

    return translations[key] || key;
  },
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/ops/useOpsSelectionParam', () => ({
  useOpsSelectionParam: () => ({
    selectedId: 'lead-1',
    setSelectedId: vi.fn(),
    clearSelectedId: vi.fn(),
  }),
}));

vi.mock('../actions', () => ({
  convertLeadToClient: vi.fn(),
  updateLeadStatus: (...args: unknown[]) => updateLeadStatus(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/ops/OpsStatusBadge', () => ({
  OpsStatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock('@/components/ops/OpsFiltersBar', () => ({
  OpsFiltersBar: () => null,
}));

vi.mock('@/components/ops/OpsQueryState', () => ({
  OpsQueryState: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ops/OpsTable', () => ({
  OpsTable: ({ rows }: { rows: Array<{ cells: ReactNode[] }> }) => (
    <div>
      {rows.map((row, index) => (
        <div key={index}>{row.cells}</div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ops/OpsDrawer', () => ({
  OpsDrawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ops/OpsTimeline', () => ({
  OpsTimeline: ({
    title,
    emptyLabel,
    events,
  }: {
    title: string;
    emptyLabel: string;
    events: Array<{ id: string; title: string; description?: string }>;
  }) => (
    <div>
      <span>{title}</span>
      <span>{emptyLabel}</span>
      {events.map(event => (
        <div key={event.id}>
          <span>{event.title}</span>
          {event.description ? <span>{event.description}</span> : null}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ops/OpsActionBar', () => ({
  OpsActionBar: ({
    primary,
    secondary,
  }: {
    primary?: { label: string; onClick?: () => void };
    secondary?: Array<{ id: string; label: string; onClick?: () => void }>;
  }) => (
    <div>
      {primary ? <button onClick={primary.onClick}>{primary.label}</button> : null}
      {secondary?.map(action => (
        <button key={action.id} onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

import { AgentLeadsProPage } from './AgentLeadsProPage';

describe('AgentLeadsProPage', () => {
  it('localizes canonical lead statuses and timeline copy', () => {
    render(
      <AgentLeadsProPage
        leads={[
          {
            id: 'lead-1',
            firstName: 'Arta',
            lastName: 'Krasniqi',
            email: 'arta@example.com',
            phone: '+38344111222',
            status: 'payment_pending',
            source: 'web_form',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            branch: { name: 'Prishtina' },
          },
        ]}
      />
    );

    expect(screen.getAllByText('Në pritje të pagesës').length).toBeGreaterThan(0);
    expect(screen.queryByText('PAYMENT PENDING')).not.toBeInTheDocument();
    expect(screen.getByText('Konverto në klient')).toBeInTheDocument();
    expect(screen.getByText('Kronologjia')).toBeInTheDocument();
    expect(screen.getByText('Lead-i u krijua')).toBeInTheDocument();
    expect(screen.getByText('Burimi: web_form')).toBeInTheDocument();
  });

  it('routes the pay_cash action to payment_pending', () => {
    render(
      <AgentLeadsProPage
        leads={[
          {
            id: 'lead-1',
            firstName: 'Arta',
            lastName: 'Krasniqi',
            email: 'arta@example.com',
            phone: '+38344111222',
            status: 'contacted',
            source: 'web_form',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            branch: { name: 'Prishtina' },
          },
        ]}
      />
    );

    fireEvent.click(screen.getByText('Më shumë veprime'));
    fireEvent.click(screen.getByText('Paguaj me para në dorë'));

    expect(updateLeadStatus).toHaveBeenCalledWith('lead-1', 'payment_pending');
  });
});
