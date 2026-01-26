import { AgentLeadsOpsClient } from './AgentLeadsOpsClient';

export function AgentLeadsOpsPage({ leads }: { leads: any[] }) {
  return <AgentLeadsOpsClient leads={leads} />;
}
