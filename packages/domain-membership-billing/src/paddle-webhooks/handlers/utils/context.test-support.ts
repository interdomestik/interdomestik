import { vi, type Mock } from 'vitest';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

// Mock the database structure with basic spies
vi.mock('@interdomestik/database', () => {
  const db = {
    query: {
      user: {
        findFirst: vi.fn(),
      },
      tenantSettings: {
        findFirst: vi.fn(),
      },
      subscriptions: {
        findFirst: vi.fn(),
      },
    },
  };
  return {
    db,
    withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => await cb(db)),
    ...resolution,
  };
});

type ResolutionMocks = {
  authorizePaddleTenant: MockFunction;
  resolvePaddleSubscriptionOwner: MockFunction;
  resolvePaddleUserOwner: MockFunction;
};

const resolution: ResolutionMocks = vi.hoisted(() => ({
  authorizePaddleTenant: vi.fn(),
  resolvePaddleSubscriptionOwner: vi.fn(),
  resolvePaddleUserOwner: vi.fn(),
}));

// Helper to mock response AND execute 'where' callback for coverage
export const mockDbResponse = (returnValue: any) => {
  return (args: any) => {
    if (args?.where && typeof args.where === 'function') {
      // Execute the callback with dummy operators
      args.where(
        {},
        {
          and: (...a: any[]) => a,
          eq: (a: any, b: any) => [a, b],
          or: (...a: any[]) => a,
        }
      );
    }
    return Promise.resolve(returnValue);
  };
};

export { resolution };
