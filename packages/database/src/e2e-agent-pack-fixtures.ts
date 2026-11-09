import { e2eEmail } from './e2e-users';
import { packId } from './seed-utils/seed-ids';

export const E2E_AGENT_PACK_USERS = {
  AGENT: {
    id: packId('agent', 'agon'),
    tenantId: 'tenant_ks',
    email: e2eEmail('agent'),
    legacyEmail: 'agent@interdomestik.local',
  },
  CLIENTS: [
    {
      id: packId('agent', 'client', 0),
      tenantId: 'tenant_ks',
      email: e2eEmail('client.paid'),
      legacyEmail: 'client.paid@example.com',
      name: 'Client Paid',
      status: 'active',
    },
    {
      id: packId('agent', 'client', 1),
      tenantId: 'tenant_ks',
      email: e2eEmail('client.pending'),
      legacyEmail: 'client.pending@example.com',
      name: 'Client Pending',
      status: 'paused',
    },
  ],
} as const;
