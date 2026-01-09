export const SEED_PASSWORD = 'FullSeedPass123!';

export const TENANTS = {
  MK: 'tenant_mk',
  KS: 'tenant_ks',
};

export const BRANCHES = [
  // MK Branches
  {
    id: 'mk_branch_a',
    name: 'Skopje (Main)',
    tenantId: TENANTS.MK,
    code: 'MK-SKP',
    slug: 'mk-skopje',
  },
  {
    id: 'mk_branch_b',
    name: 'Tetovo (East)',
    tenantId: TENANTS.MK,
    code: 'MK-TET',
    slug: 'mk-tetovo',
  },
  // KS Branches
  {
    id: 'ks_branch_a',
    name: 'Prishtina (Main)',
    tenantId: TENANTS.KS,
    code: 'KS-PRI',
    slug: 'ks-prishtina',
  },
  {
    id: 'ks_branch_b',
    name: 'Prizren (West)',
    tenantId: TENANTS.KS,
    code: 'KS-PRZ',
    slug: 'ks-prizren',
  },
];

export const USERS = [
  // Super Admin
  {
    id: 'golden_super_admin',
    email: 'super@interdomestik.com',
    name: 'Super Admin',
    role: 'super_admin',
    tenantId: TENANTS.MK,
  },

  // MK Staff
  {
    id: 'golden_mk_admin',
    email: 'admin.mk@interdomestik.com',
    name: 'MK Admin',
    role: 'tenant_admin',
    tenantId: TENANTS.MK,
  },
  {
    id: 'golden_mk_staff',
    email: 'staff.mk@interdomestik.com',
    name: 'MK Staff',
    role: 'staff',
    tenantId: TENANTS.MK,
  },
  {
    id: 'golden_mk_bm_a',
    email: 'bm.mk.a@interdomestik.com',
    name: 'MK Manager A',
    role: 'branch_manager',
    tenantId: TENANTS.MK,
    branchId: 'mk_branch_a',
  },
  {
    id: 'golden_mk_bm_b',
    email: 'bm.mk.b@interdomestik.com',
    name: 'MK Manager B',
    role: 'branch_manager',
    tenantId: TENANTS.MK,
    branchId: 'mk_branch_b',
  },

  // KS Staff
  {
    id: 'golden_ks_admin',
    email: 'admin.ks@interdomestik.com',
    name: 'KS Admin',
    role: 'tenant_admin',
    tenantId: TENANTS.KS,
  },
  {
    id: 'golden_ks_staff',
    email: 'staff.ks@interdomestik.com',
    name: 'KS Staff',
    role: 'staff',
    tenantId: TENANTS.KS,
  },
  {
    id: 'full_ks_bm_a',
    email: 'bm.ks.a@interdomestik.com',
    name: 'KS Manager A',
    role: 'branch_manager',
    tenantId: TENANTS.KS,
    branchId: 'ks_branch_a',
  },

  // Agents
  {
    id: 'golden_mk_agent_a1',
    email: 'agent.mk.a1@interdomestik.com',
    name: 'MK Agent A1',
    role: 'agent',
    tenantId: TENANTS.MK,
  },
  {
    id: 'golden_mk_agent_a2',
    email: 'agent.mk.a2@interdomestik.com',
    name: 'MK Agent A2',
    role: 'agent',
    tenantId: TENANTS.MK,
  },
  {
    id: 'full_mk_agent_b1',
    email: 'agent.mk.b1@interdomestik.com',
    name: 'MK Agent B1',
    role: 'agent',
    tenantId: TENANTS.MK,
  },
  {
    id: 'golden_ks_agent_a1',
    email: 'agent.ks.a1@interdomestik.com',
    name: 'KS Agent A1',
    role: 'agent',
    tenantId: TENANTS.KS,
  },
  {
    id: 'full_ks_agent_b1',
    email: 'agent.ks.b1@interdomestik.com',
    name: 'KS Agent B1',
    role: 'agent',
    tenantId: TENANTS.KS,
  },
];
