import { createMemberCtaPage } from '../_cta-handoff-page';

export default createMemberCtaPage({
  namespace: 'dashboard.member_cta_pages.claim_report',
  primaryHref: '/member/claims/new',
  testId: 'report-page-ready',
  titleKey: 'cta_report',
});
