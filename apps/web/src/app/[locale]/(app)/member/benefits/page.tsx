import { createMemberCtaPage } from '../_cta-handoff-page';

export default createMemberCtaPage({
  namespace: 'dashboard.member_cta_pages.benefits',
  primaryHref: '/member/membership',
  testId: 'benefits-page-ready',
  titleKey: 'cta_benefits',
});
