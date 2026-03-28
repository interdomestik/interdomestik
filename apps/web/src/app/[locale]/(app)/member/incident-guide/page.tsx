import { createMemberCtaPage } from '../_cta-handoff-page';

export default createMemberCtaPage({
  namespace: 'dashboard.member_cta_pages.incident_guide',
  primaryHref: '/member/claims/new',
  testId: 'incident-guide-page-ready',
  titleKey: 'cta_incident',
});
