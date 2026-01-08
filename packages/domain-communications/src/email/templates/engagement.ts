import { buildEmailTemplate, DEFAULT_APP_NAME, DEFAULT_APP_URL, joinUrl } from './base';

export function renderNpsSurveyEmail(params: { name: string; token: string }) {
  const surveyUrl = joinUrl(DEFAULT_APP_URL, `/nps/${params.token}`);
  return buildEmailTemplate({
    title: 'Quick question: how are we doing?',
    intro: `Hi ${params.name}, on a scale from 0–10, how likely are you to recommend us to a friend?`,
    details: ['It takes less than 10 seconds.'],
    ctaLabel: 'Answer the survey',
    ctaUrl: surveyUrl,
    footer: `${DEFAULT_APP_NAME} Team`,
  });
}

export function renderWelcomeEmail(params: { name: string }) {
  const dashboardUrl = joinUrl(DEFAULT_APP_URL, '/member');
  return buildEmailTemplate({
    title: `Welcome to ${DEFAULT_APP_NAME}!`,
    intro: `Hi ${params.name}, we're glad to have you with us. Your membership is now active.`,
    details: [
      'You now have 24/7 access to our assistance services.',
      'Save our hotline number: +383 49 123 456',
    ],
    ctaLabel: 'Go to Dashboard',
    ctaUrl: dashboardUrl,
  });
}

export function renderOnboardingEmail(params: { name: string }) {
  const cardUrl = joinUrl(DEFAULT_APP_URL, '/member/membership/card');
  return buildEmailTemplate({
    title: 'Download your Digital Card',
    intro: `Hi ${params.name}, have you downloaded your digital membership card yet?`,
    details: [
      'Add it to your Apple Wallet or Google Pay.',
      'Show it to our partners to get instant discounts.',
    ],
    ctaLabel: 'Get my card',
    ctaUrl: cardUrl,
  });
}

export function renderCheckinEmail(params: { name: string }) {
  const dashboardUrl = joinUrl(DEFAULT_APP_URL, '/member');
  return buildEmailTemplate({
    title: 'How is everything going?',
    intro: `Hi ${params.name}, just checking in to see if you need any assistance.`,
    details: ['Remember, we are here to help you with any claims or legal questions.'],
    ctaLabel: 'Visit Dashboard',
    ctaUrl: dashboardUrl,
  });
}

export function renderEngagementDay30Email(params: { name: string }) {
  const dashboardUrl = joinUrl(DEFAULT_APP_URL, '/member');
  return buildEmailTemplate({
    title: '30 days protected — quick check-in',
    intro: `Hi ${params.name}, you’ve been protected for 30 days. Here’s what to do if something happens.`,
    details: [
      'Save the hotline number in your phone.',
      'Upload evidence early (photos, police report, estimates).',
      'If you have questions, message us from your portal.',
    ],
    ctaLabel: 'Open member portal',
    ctaUrl: dashboardUrl,
  });
}

export function renderEngagementDay60Email(params: { name: string }) {
  return buildEmailTemplate({
    title: '60 days in — maximize your benefits',
    intro: `Hi ${params.name}, a reminder: your membership isn’t only for claims — it’s for guidance.`,
    details: [
      'Use us for legal questions before you sign or accept anything.',
      'Keep your documents organized in your portal.',
      'Tell a family member where to find the hotline number.',
    ],
    ctaLabel: 'View my membership',
    ctaUrl: joinUrl(DEFAULT_APP_URL, '/member/membership'),
  });
}

export function renderEngagementDay90Email(params: { name: string }) {
  const dashboardUrl = joinUrl(DEFAULT_APP_URL, '/member');
  return buildEmailTemplate({
    title: '3 months protected — we’re here 24/7',
    intro: `Hi ${params.name}, you’ve been with us for 3 months. If you ever need help, start here.`,
    details: [
      'You can file a claim in minutes from your portal.',
      'We aim to respond within 24h.',
      'Keep your hotline number accessible — it’s the fastest path in emergencies.',
    ],
    ctaLabel: 'Go to portal',
    ctaUrl: dashboardUrl,
  });
}

export function renderNewsletterEmail(params: {
  month: string;
  hero: { title: string; imageUrl?: string; text: string; ctaLabel?: string; ctaUrl?: string };
  partner?: { name: string; discount: string; description: string; imageUrl?: string };
  tip?: { title: string; text: string };
}) {
  const dashboardUrl = joinUrl(DEFAULT_APP_URL, '/member');

  const details = [params.hero.text];

  if (params.partner) {
    details.push(
      '---',
      `Partner of the Month: ${params.partner.name}`,
      `${params.partner.description}`,
      `Discount: ${params.partner.discount}`
    );
  }

  if (params.tip) {
    details.push('---', `Safety Tip: ${params.tip.title}`, params.tip.text);
  }

  return buildEmailTemplate({
    title: `${DEFAULT_APP_NAME} Newsletter - ${params.month}`,
    intro: params.hero.title,
    details: details,
    ctaLabel: params.hero.ctaLabel || 'Read More',
    ctaUrl: params.hero.ctaUrl || dashboardUrl,
  });
}

export function renderSeasonalEmail(params: { season: 'winter' | 'summer'; name: string }) {
  const dashboardUrl = joinUrl(DEFAULT_APP_URL, '/member');

  if (params.season === 'winter') {
    return buildEmailTemplate({
      title: 'Winter Safety Check ❄️',
      intro: `Hi ${params.name}, winter is here and road safety is more important than ever.`,
      details: [
        'Check your tires: Winter tires are mandatory in many regions.',
        'Emergency kit: Keep a blanket and snow shovel in your car.',
        'Slow down: Icy roads require longer braking distances.',
      ],
      ctaLabel: 'Safety Checklist',
      ctaUrl: dashboardUrl,
    });
  }

  return buildEmailTemplate({
    title: 'Summer Readiness ☀️',
    intro: `Hi ${params.name}, getting ready for your summer travels?`,
    details: [
      'AC Check: Make sure your car stays cool during long trips.',
      'International Travel: Bring your Green Card if traveling across borders.',
      'Hydration: Always keep water in the car during high temperatures.',
    ],
    ctaLabel: 'Travel Guide',
    ctaUrl: dashboardUrl,
  });
}

export function renderAnnualReportEmail(params: { name: string; year: number }) {
  const wrappedUrl = joinUrl(DEFAULT_APP_URL, '/dashboard/wrapped');
  return buildEmailTemplate({
    title: `Your ${params.year} Protection Summary is Ready! 🏆`,
    intro: `Hi ${params.name}, we've summarized your year with Interdomestik. Discover how your membership protected you in ${params.year}.`,
    details: [
      'See your total days protected.',
      'Review your resolved claims and savings.',
      'Share your protection status with others.',
    ],
    ctaLabel: 'View My Summary',
    ctaUrl: wrappedUrl,
  });
}
