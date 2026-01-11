export const SEED_PASSWORD = 'FullSeedPass123!';

export const TENANTS = {
  MK: 'tenant_mk',
  KS: 'tenant_ks',
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGIONALIZED NAMES
// ═══════════════════════════════════════════════════════════════════════════════

// Macedonian names (Latin script for UI compatibility)
export const MK_NAMES = {
  firstNames: [
    'Aleksandar',
    'Elena',
    'Marko',
    'Ana',
    'Stefan',
    'Maja',
    'Nikola',
    'Milena',
    'Petar',
  ],
  lastNames: ['Stojanovski', 'Petrovska', 'Dimitrioski', 'Trajkova', 'Ivanovski', 'Georgieva'],
  agentNames: ['Stefan Dimitrioski', 'Elena Petrovska'],
  memberNames: [
    'Aleksandar Stojanovski',
    'Ana Trajkova',
    'Marko Ivanovski',
    'Milena Georgieva',
    'Nikola Petrov',
    'Maja Stoilova',
    'Petar Jovanovski',
    'Elena Nikolova',
    'Stefan Trajkovski',
  ],
  leadNames: ['Dragan Todorov', 'Vesna Miteva'],
};

// Albanian names (standard Latin)
export const KS_NAMES = {
  firstNames: ['Arben', 'Drita', 'Blerim', 'Ganimete', 'Valon', 'Arta', 'Driton', 'Elira', 'Burim'],
  lastNames: ['Krasniqi', 'Gashi', 'Hoxha', 'Berisha', 'Sadiku', 'Rexhepi', 'Haziri', 'Kelmendi'],
  agentNames: ['Blerim Hoxha', 'Drita Gashi'],
  memberNames: [
    'Luan Berisha',
    'Era Kelmendi',
    'Gentiana Shala',
    'Valon Sadiku',
    'Arta Rexhepi',
    'Drin Haziri',
    'Edona Bytyqi',
    'Florent Morina',
    'Engjëll Krasniqi',
  ],
  leadNames: ['Arben Krasniqi', 'Edona Bytyqi'],
};

export const BRANCHES = [
  // MK Branches
  {
    id: 'mk_branch_a',
    name: 'Skopje (Main)',
    tenantId: TENANTS.MK,
    code: 'MK-A',
    slug: 'mk-skopje',
  },
  {
    id: 'mk_branch_b',
    name: 'Tetovo (East)',
    tenantId: TENANTS.MK,
    code: 'MK-B',
    slug: 'mk-tetovo',
  },
  // KS Branches
  {
    id: 'ks_branch_a',
    name: 'Prishtina (Main)',
    tenantId: TENANTS.KS,
    code: 'KS-A',
    slug: 'ks-prishtina',
  },
  {
    id: 'ks_branch_b',
    name: 'Prizren (West)',
    tenantId: TENANTS.KS,
    code: 'KS-B',
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // MK Staff (Macedonian Names)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'golden_mk_admin',
    email: 'admin.mk@interdomestik.com',
    name: 'Aleksandar Stojanovski',
    role: 'tenant_admin',
    tenantId: TENANTS.MK,
  },
  {
    id: 'golden_mk_staff',
    email: 'staff.mk@interdomestik.com',
    name: 'Elena Petrovska',
    role: 'staff',
    tenantId: TENANTS.MK,
  },
  {
    id: 'golden_mk_bm_a',
    email: 'bm.mk.a@interdomestik.com',
    name: 'Marko Dimitrioski',
    role: 'branch_manager',
    tenantId: TENANTS.MK,
    branchId: 'mk_branch_a',
  },
  {
    id: 'golden_mk_bm_b',
    email: 'bm.mk.b@interdomestik.com',
    name: 'Ana Trajkova',
    role: 'branch_manager',
    tenantId: TENANTS.MK,
    branchId: 'mk_branch_b',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // KS Staff (Albanian Names)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'golden_ks_admin',
    email: 'admin.ks@interdomestik.com',
    name: 'Arbër Krasniqi',
    role: 'tenant_admin',
    tenantId: TENANTS.KS,
  },
  {
    id: 'golden_ks_staff',
    email: 'staff.ks@interdomestik.com',
    name: 'Drita Gashi',
    role: 'staff',
    tenantId: TENANTS.KS,
  },
  {
    id: 'full_ks_bm_a',
    email: 'bm.ks.a@interdomestik.com',
    name: 'Valon Berisha',
    role: 'branch_manager',
    tenantId: TENANTS.KS,
    branchId: 'ks_branch_a',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // MK Agents (Macedonian Names)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'golden_mk_agent_a1',
    email: 'agent.mk.a1@interdomestik.com',
    name: 'Stefan Dimitrioski',
    role: 'agent',
    tenantId: TENANTS.MK,
  },
  {
    id: 'golden_mk_agent_a2',
    email: 'agent.mk.a2@interdomestik.com',
    name: 'Maja Georgieva',
    role: 'agent',
    tenantId: TENANTS.MK,
  },
  {
    id: 'full_mk_agent_b1',
    email: 'agent.mk.b1@interdomestik.com',
    name: 'Nikola Performov',
    role: 'agent',
    tenantId: TENANTS.MK,
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // KS Agents (Albanian Names)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'golden_ks_agent_a1',
    email: 'agent.ks.a1@interdomestik.com',
    name: 'Blerim Hoxha',
    role: 'agent',
    tenantId: TENANTS.KS,
  },
  {
    id: 'full_ks_agent_b1',
    email: 'agent.ks.b1@interdomestik.com',
    name: 'Driton Bytyqi',
    role: 'agent',
    tenantId: TENANTS.KS,
  },
];
