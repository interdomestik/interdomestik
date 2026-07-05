const CANONICAL_PATH_BY_ACCOUNT: Record<string, string> = {
  member: '/en/member',
  agent: '/en/agent',
  staff: '/en/staff',
  admin_ks: '/en/admin',
};

const MARKER_BY_ACCOUNT: Record<string, string> = {
  member: 'dashboard-page-ready',
  agent: 'agent-page-ready',
  staff: 'staff-page-ready',
  admin_ks: 'admin-page-ready',
};

type CountFn = (selector: string, page: FakePage) => number;

type FakePage = {
  account: string;
  contextId?: number;
  currentPath: string;
  loginAttempt: number;
};

function testIdFromSelector(selector: string): string {
  return /\[data-testid="([^"]+)"\]/.exec(selector)?.[1] || '';
}

function createFakePage(countFn: CountFn): any {
  return {
    account: '',
    currentPath: '',
    loginAttempt: 0,
    async goto(url: string) {
      this.currentPath = new URL(url).pathname;
    },
    locator(selector: string) {
      return {
        count: async () => countFn(selector, this),
        isVisible: async () => false,
      };
    },
    getByTestId() {
      return { isVisible: async () => false };
    },
    url() {
      return this.currentPath || '';
    },
  };
}

function sharedMarkerCount(selector: string, account: string, path: string): number | null {
  const testId = testIdFromSelector(selector);
  if (path === CANONICAL_PATH_BY_ACCOUNT[account]) {
    return testId === MARKER_BY_ACCOUNT[account] ? 1 : 0;
  }
  if (account === 'agent' && path === '/en/member') {
    return testId === 'dashboard-page-ready' ? 1 : 0;
  }
  if (account === 'admin_ks' && path === '/en/member') {
    return testId === 'dashboard-page-ready' || testId === 'admin-page-ready' ? 1 : 0;
  }
  return null;
}

function markerCount(selector: string, page: FakePage, mode: string): number {
  const testId = testIdFromSelector(selector);
  if (page.account === 'staff' && page.currentPath === '/en/staff' && mode !== 'fresh') {
    return testId === 'not-found-page' ? 1 : 0;
  }
  return (
    sharedMarkerCount(selector, page.account, page.currentPath) ??
    (testId === 'not-found-page' ? 1 : 0)
  );
}

function stabilizingMarkerCount(selector: string, page: FakePage): number {
  const testId = testIdFromSelector(selector);
  if (page.account === 'agent' && page.currentPath === '/en/agent' && page.loginAttempt < 3) {
    return testId === 'not-found-page' ? 1 : 0;
  }
  return (
    sharedMarkerCount(selector, page.account, page.currentPath) ??
    (testId === 'not-found-page' ? 1 : 0)
  );
}

export function createPage(contextId: number, contextModes: string[]): any {
  const page = createFakePage((selector, currentPage) =>
    markerCount(selector, currentPage, contextModes[contextId])
  );
  page.contextId = contextId;
  return page;
}

export function createStabilizingPage(): any {
  return createFakePage(stabilizingMarkerCount);
}
