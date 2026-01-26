import { AgentLeadsProClient } from './AgentLeadsProClient';

export function AgentLeadsProPage({ leads }: { leads: any[] }) {
  return <AgentLeadsProClient leads={leads} />;
}
