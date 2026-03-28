import { createMemberCtaPage } from '../_cta-handoff-page';

export default createMemberCtaPage({
  namespace: 'dashboard.member_cta_pages.green_card',
  primaryHref: '/member/diaspora',
  testId: 'green-card-page-ready',
  titleKey: 'cta_green_card',
});
