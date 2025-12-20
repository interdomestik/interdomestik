/**
 * Test Factories
 *
 * Factory functions for creating mock data in tests.
 * These ensure consistent test data across the test suite.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

let idCounter = 0;

const generateId = (prefix = 'test') => `${prefix}-${++idCounter}`;

const randomElement = <T>(array: T[]): T => array[Math.floor(Math.random() * array.length)];

const randomDate = (start = new Date(2024, 0, 1), end = new Date()): Date => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// ═══════════════════════════════════════════════════════════════════════════════
// USER FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: 'user' | 'admin' | 'agent' | 'staff';
  createdAt: Date;
  updatedAt: Date;
}

export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: generateId('user'),
  name: `Test User ${idCounter}`,
  email: `testuser${idCounter}@example.com`,
  emailVerified: true,
  image: null,
  role: 'user',
  createdAt: randomDate(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockAdmin = (overrides: Partial<MockUser> = {}): MockUser =>
  createMockUser({ role: 'admin', name: `Admin User ${idCounter}`, ...overrides });

export const createMockAgent = (overrides: Partial<MockUser> = {}): MockUser =>
  createMockUser({ role: 'agent', name: `Agent ${idCounter}`, ...overrides });

export const createMockStaff = (overrides: Partial<MockUser> = {}): MockUser =>
  createMockUser({ role: 'staff', name: `Staff ${idCounter}`, ...overrides });

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockSession {
  user: MockUser;
  session: {
    id: string;
    token: string;
    expiresAt: Date;
  };
}

export const createMockSession = (userOverrides: Partial<MockUser> = {}): MockSession => {
  const user = createMockUser(userOverrides);
  return {
    user,
    session: {
      id: generateId('session'),
      token: `token-${generateId()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    },
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIM FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

export type ClaimCategory =
  | 'retail'
  | 'services'
  | 'telecom'
  | 'utilities'
  | 'insurance'
  | 'banking'
  | 'travel'
  | 'real_estate'
  | 'auto'
  | 'healthcare'
  | 'other';

export interface MockClaim {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: ClaimStatus;
  category: ClaimCategory;
  companyName: string;
  claimAmount: string | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const CLAIM_CATEGORIES: ClaimCategory[] = [
  'retail',
  'services',
  'telecom',
  'utilities',
  'insurance',
  'banking',
  'travel',
  'real_estate',
  'auto',
  'healthcare',
  'other',
];

const SAMPLE_COMPANIES = [
  'TechCorp Ltd',
  'Retail Giants',
  'Telecom Plus',
  'Insurance Co',
  'Bank of Example',
  'Travel Agency',
  'Auto Services',
  'Health Clinic',
];

const SAMPLE_TITLES = [
  'Defective product refund request',
  'Service not rendered as promised',
  'Unauthorized charges on account',
  'Insurance claim denial appeal',
  'Flight cancellation compensation',
  'Contract breach dispute',
];

export const createMockClaim = (overrides: Partial<MockClaim> = {}): MockClaim => ({
  id: generateId('claim'),
  userId: generateId('user'),
  title: randomElement(SAMPLE_TITLES),
  description: 'This is a detailed description of the claim with all relevant information.',
  status: 'draft',
  category: randomElement(CLAIM_CATEGORIES),
  companyName: randomElement(SAMPLE_COMPANIES),
  claimAmount: (100 + Math.floor(Math.random() * 4900)).toFixed(2),
  currency: 'EUR',
  createdAt: randomDate(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockClaimInStatus = (
  status: ClaimStatus,
  overrides: Partial<MockClaim> = {}
): MockClaim => createMockClaim({ status, ...overrides });

export const createMockClaimList = (
  count: number,
  overrides: Partial<MockClaim> = {}
): MockClaim[] => Array.from({ length: count }, () => createMockClaim(overrides));

// ═══════════════════════════════════════════════════════════════════════════════
// LEAD FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockLead {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: 'new' | 'contacted' | 'converted' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

export const createMockLead = (overrides: Partial<MockLead> = {}): MockLead => ({
  id: generateId('lead'),
  name: `Lead ${idCounter}`,
  phone: `+383 49 ${100000 + Math.floor(Math.random() * 899999)}`,
  category: randomElement(['auto', 'insurance', 'retail', 'services']),
  status: 'new',
  createdAt: randomDate(),
  updatedAt: new Date(),
  ...overrides,
});

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockMessage {
  id: string;
  claimId: string;
  senderId: string;
  content: string;
  isInternal: boolean;
  readAt: Date | null;
  createdAt: Date;
  sender: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  };
}

const SAMPLE_MESSAGES = [
  'Hello, I have a question about my claim.',
  'Can you provide more details about the incident?',
  'I have attached the requested documents.',
  'Thank you for your patience.',
  'We are reviewing your case.',
];

export const createMockMessage = (overrides: Partial<MockMessage> = {}): MockMessage => {
  const senderId = overrides.senderId || generateId('user');
  return {
    id: generateId('msg'),
    claimId: generateId('claim'),
    senderId,
    content: randomElement(SAMPLE_MESSAGES),
    isInternal: false,
    readAt: null,
    createdAt: randomDate(),
    sender: {
      id: senderId,
      name: `User ${idCounter}`,
      image: null,
      role: 'user',
    },
    ...overrides,
  };
};

export const createMockAgentMessage = (overrides: Partial<MockMessage> = {}): MockMessage => {
  const senderId = overrides.senderId || generateId('agent');
  return createMockMessage({
    senderId,
    sender: {
      id: senderId,
      name: `Agent ${idCounter}`,
      image: null,
      role: 'agent',
    },
    ...overrides,
  });
};

export const createMockInternalNote = (overrides: Partial<MockMessage> = {}): MockMessage =>
  createMockAgentMessage({
    isInternal: true,
    content: 'Internal note for agents only.',
    ...overrides,
  });

export const createMockMessageThread = (
  count: number,
  claimId: string,
  overrides: Partial<MockMessage> = {}
): MockMessage[] =>
  Array.from({ length: count }, (_, i) =>
    createMockMessage({
      claimId,
      createdAt: new Date(Date.now() - (count - i) * 60000), // 1 min apart
      ...overrides,
    })
  );

// ═══════════════════════════════════════════════════════════════════════════════
// FORM DATA FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export const createMockClaimFormData = (
  data: Partial<{
    title: string;
    companyName: string;
    description: string;
    category: string;
    claimAmount: string;
    currency: string;
  }> = {}
): FormData => {
  const formData = new FormData();

  const defaults = {
    title: 'Test claim for defective product',
    companyName: 'Test Company',
    description: 'This is a detailed test description with more than 20 characters.',
    category: 'retail',
    claimAmount: '250.00',
    currency: 'EUR',
  };

  const merged = { ...defaults, ...data };

  Object.entries(merged).forEach(([key, value]) => {
    if (value !== undefined) {
      formData.append(key, value);
    }
  });

  return formData;
};

// ═══════════════════════════════════════════════════════════════════════════════
// API RESPONSE FACTORIES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const createMockSuccessResponse = <T>(data: T): MockApiResponse<T> => ({
  success: true,
  data,
});

export const createMockErrorResponse = (error: string): MockApiResponse<never> => ({
  success: false,
  error,
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESET FUNCTION (for test cleanup)
// ═══════════════════════════════════════════════════════════════════════════════

export const resetFactories = (): void => {
  idCounter = 0;
};
