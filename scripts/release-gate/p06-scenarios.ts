function buildP06CanonicalRouteScenarios() {
  return [
    {
      id: 'S1',
      title: 'Canonical agent access and forbidden elevated portals',
      accountKey: 'agent',
      checks: [
        { route: '/agent', expected: { agent: true } },
        { route: '/staff', expected: { staff: false } },
        { route: '/admin', expected: { admin: false } },
      ],
      expectedSummary: '/agent agent=true; /staff staff=false; /admin admin=false',
    },
    {
      id: 'S2',
      title: 'Canonical staff access and forbidden elevated portals',
      accountKey: 'staff',
      checks: [
        { route: '/staff', expected: { staff: true } },
        { route: '/agent', expected: { agent: false } },
        { route: '/admin', expected: { admin: false } },
      ],
      expectedSummary: '/staff staff=true; /agent agent=false; /admin admin=false',
    },
  ];
}

module.exports = {
  buildP06CanonicalRouteScenarios,
};
