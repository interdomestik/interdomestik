/**
 * Premium Thank-you Letter Email Template
 * Based on Hero Page promo elements with prime branding
 */

type ThankYouLetterParams = {
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: string;
  expiresAt: string;
  qrCodeDataUrl?: string; // Base64 QR code image
  locale?: 'en' | 'sq';
};

const DEFAULT_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Interdomestik Asistenca';
const DEFAULT_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';

// Translations
const TRANSLATIONS = {
  en: {
    subject: '🎉 Welcome to Asistenca – Your Protection Starts Now!',
    headline: 'Welcome to the Family',
    subheadline: "You're now protected by Asistenca",
    memberNumberLabel: 'Member Number',
    planLabel: 'Your Plan',
    validFromLabel: 'Member Since',
    validUntilLabel: 'Valid Until',
    classificationNote:
      'Your member ID is active now. Filing-country routing is confirmed later when we review your member details.',
    trustTitle: 'What You Get',
    trust1Value: '8,500+',
    trust1Label: 'Active Members Trust Us',
    trust2Value: '24h',
    trust2Label: 'Case Opening Time',
    trust3Value: '100%',
    trust3Label: 'Legal Protection',
    benefitsTitle: 'Your Benefits Include',
    benefit1: '24/7 Emergency Hotline',
    benefit2: 'Expert Legal Consultations',
    benefit3: 'Full Claims Management',
    benefit4: 'Injury Categorization',
    benefit5: 'Damage Calculation',
    guarantee: '30-day money-back guarantee',
    ctaLabel: 'Access Your Dashboard',
    qrLabel: 'Scan for Digital Card',
    footer: 'Questions? Reply to this email or call our 24/7 hotline.',
    tagline: 'We work for you, not the insurance company.',
  },
  sq: {
    subject: '🎉 Mirësevini në Asistenca – Mbrojtja Juaj Fillon Tani!',
    headline: 'Mirësevini në Familje',
    subheadline: 'Tani jeni të mbrojtur nga Asistenca',
    memberNumberLabel: 'Numri i Anëtarit',
    planLabel: 'Plani Juaj',
    validFromLabel: 'Anëtar Që Nga',
    validUntilLabel: 'Valid Deri Më',
    classificationNote:
      'ID-ja juaj e anëtarit është aktive tani. Shteti i trajtimit të rastit konfirmohet më vonë kur t’i shqyrtojmë të dhënat tuaja.',
    trustTitle: 'Çfarë Merrni',
    trust1Value: '8,500+',
    trust1Label: 'Anëtarë Aktivë Na Besojnë',
    trust2Value: '24h',
    trust2Label: 'Kohë Hapje Çështjeje',
    trust3Value: '100%',
    trust3Label: 'Mbrojtje Ligjore',
    benefitsTitle: 'Përfitimet Tuaja',
    benefit1: 'Linja Emergjente 24/7',
    benefit2: 'Konsultime Ligjore nga Ekspertë',
    benefit3: 'Menaxhim i Plotë i Ankesave',
    benefit4: 'Kategorizimi i Lëndimeve',
    benefit5: 'Llogaritja e Dëmeve',
    guarantee: 'Garanci e kthimit të parave brenda 30 ditëve',
    ctaLabel: 'Hyni në Panel',
    qrLabel: 'Skanoni për Kartën Digjitale',
    footer: 'Pyetje? Përgjigjuni këtij emaili ose telefononi linjën tonë 24/7.',
    tagline: 'Ne punojmë për ju, jo për kompanitë e sigurimeve.',
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderThankYouLetterEmail(params: ThankYouLetterParams) {
  const t = TRANSLATIONS[params.locale || 'en'];
  const dashboardUrl = `${DEFAULT_APP_URL}/member`;

  const memberName = escapeHtml(params.memberName);
  const memberNumber = escapeHtml(params.memberNumber);
  const planName = escapeHtml(params.planName);
  const planPrice = escapeHtml(params.planPrice);
  const memberSince = escapeHtml(params.memberSince);
  const expiresAt = escapeHtml(params.expiresAt);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background:linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); font-family: 'Segoe UI', Arial, sans-serif;">
    <div style="max-width:600px; margin:0 auto; padding:24px 16px;">
      
      <!-- Prime Header with Gradient -->
      <div style="background: linear-gradient(135deg, #0f766e 0%, #0e7490 50%, #6366f1 100%); border-radius:24px 24px 0 0; padding:40px 32px; text-align:center;">
        <div style="display:inline-block; background:rgba(255,255,255,0.2); backdrop-filter:blur(10px); padding:8px 20px; border-radius:20px; margin-bottom:20px;">
          <span style="color:#fcd34d; font-size:12px; font-weight:800; letter-spacing:2px; text-transform:uppercase;">✨ ${t.subject.split('–')[0].trim()}</span>
        </div>
        <h1 style="margin:0 0 8px; font-size:32px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">${t.headline}</h1>
        <p style="margin:0 0 24px; font-size:16px; color:rgba(255,255,255,0.9);">${t.subheadline}</p>
        <p style="margin:0; font-size:18px; font-weight:600; color:#ffffff;">${params.locale === 'sq' ? 'Përshëndetje' : 'Hi'} ${memberName},</p>
      </div>

      <!-- Member Card -->
      <div style="background:#ffffff; padding:32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0;">
        <div style="background:linear-gradient(145deg, #f8fafc, #ffffff); border:2px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 4px 20px rgba(15,23,42,0.05);">
          <p style="margin:0 0 4px; font-size:14px; color:#64748b; font-weight:600;">${t.memberNumberLabel}</p>
          <p style="margin:0 0 16px; font-size:24px; font-weight:800; color:#0f766e; letter-spacing:2px;">${memberNumber}</p>
          
          <div style="display:flex; gap:24px;">
            <div style="flex:1;">
              <p style="margin:0 0 4px; font-size:12px; color:#94a3b8; text-transform:uppercase; font-weight:600;">${t.planLabel}</p>
              <p style="margin:0; font-size:16px; font-weight:700; color:#1e293b;">${planName}</p>
              <p style="margin:4px 0 0; font-size:14px; color:#64748b;">${planPrice}/${params.planInterval}</p>
            </div>
            <div style="text-align:right;">
              <p style="margin:0 0 4px; font-size:12px; color:#94a3b8; text-transform:uppercase; font-weight:600;">${t.validFromLabel}</p>
              <p style="margin:0; font-size:14px; font-weight:600; color:#1e293b;">${memberSince}</p>
              <p style="margin:8px 0 0 0; font-size:12px; color:#94a3b8; text-transform:uppercase; font-weight:600;">${t.validUntilLabel}</p>
              <p style="margin:0; font-size:14px; font-weight:600; color:#1e293b;">${expiresAt}</p>
            </div>
          </div>
        </div>
        <p style="margin:16px 0 0; padding:14px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; font-size:13px; line-height:1.6; color:#475569;">
          ${t.classificationNote}
        </p>
      </div>

      <!-- Trust Ecosystem - 3 Pills -->
      <div style="background:#ffffff; padding:0 32px 32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0;">
        <p style="margin:0 0 16px; font-size:14px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px;">${t.trustTitle}</p>
        <table width="100%" cellpadding="0" cellspacing="8" style="border-collapse:separate;">
          <tr>
            <td style="background:linear-gradient(145deg, #ecfdf5, #d1fae5); border-radius:12px; padding:16px; text-align:center; width:33%;">
              <p style="margin:0; font-size:24px; font-weight:800; color:#059669;">${t.trust1Value}</p>
              <p style="margin:4px 0 0; font-size:11px; color:#047857; text-transform:uppercase; font-weight:600;">${t.trust1Label}</p>
            </td>
            <td style="background:linear-gradient(145deg, #f0fdfa, #ccfbf1); border-radius:12px; padding:16px; text-align:center; width:33%;">
              <p style="margin:0; font-size:24px; font-weight:800; color:#0d9488;">${t.trust2Value}</p>
              <p style="margin:4px 0 0; font-size:11px; color:#0f766e; text-transform:uppercase; font-weight:600;">${t.trust2Label}</p>
            </td>
            <td style="background:linear-gradient(145deg, #eff6ff, #dbeafe); border-radius:12px; padding:16px; text-align:center; width:33%;">
              <p style="margin:0; font-size:24px; font-weight:800; color:#2563eb;">${t.trust3Value}</p>
              <p style="margin:4px 0 0; font-size:11px; color:#1d4ed8; text-transform:uppercase; font-weight:600;">${t.trust3Label}</p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Benefits List -->
      <div style="background:#ffffff; padding:0 32px 32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0;">
        <p style="margin:0 0 16px; font-size:14px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px;">${t.benefitsTitle}</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td style="padding:8px 0; color:#1e293b; font-size:14px;">✓ ${t.benefit1}</td></tr>
          <tr><td style="padding:8px 0; color:#1e293b; font-size:14px;">✓ ${t.benefit2}</td></tr>
          <tr><td style="padding:8px 0; color:#1e293b; font-size:14px;">✓ ${t.benefit3}</td></tr>
          <tr><td style="padding:8px 0; color:#1e293b; font-size:14px;">✓ ${t.benefit4}</td></tr>
          <tr><td style="padding:8px 0; color:#1e293b; font-size:14px;">✓ ${t.benefit5}</td></tr>
        </table>
        <p style="margin:16px 0 0; padding:12px 16px; background:#fef3c7; border-radius:8px; font-size:13px; color:#92400e; font-weight:600;">
          🛡️ ${t.guarantee}
        </p>
      </div>

      <!-- QR Code Section -->
      ${
        params.qrCodeDataUrl
          ? `
      <div style="background:#ffffff; padding:0 32px 32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; text-align:center;">
        <img src="${params.qrCodeDataUrl}" alt="QR Code" style="width:120px; height:120px; border:2px solid #e2e8f0; border-radius:12px; padding:8px; background:#fff;" />
        <p style="margin:8px 0 0; font-size:12px; color:#64748b;">${t.qrLabel}</p>
      </div>
      `
          : ''
      }

      <!-- CTA Button -->
      <div style="background:#ffffff; padding:0 32px 32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; text-align:center;">
        <a href="${dashboardUrl}" style="display:inline-block; background:linear-gradient(135deg, #0f766e 0%, #0e7490 100%); color:#ffffff; text-decoration:none; padding:16px 32px; border-radius:12px; font-size:16px; font-weight:700; box-shadow:0 4px 14px rgba(15,118,110,0.4);">
          ${t.ctaLabel} →
        </a>
      </div>

      <!-- Footer -->
      <div style="background:linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius:0 0 24px 24px; padding:24px 32px; text-align:center;">
        <p style="margin:0 0 8px; font-size:14px; color:#94a3b8;">${t.footer}</p>
        <p style="margin:0; font-size:12px; color:#64748b; font-style:italic;">"${t.tagline}"</p>
        <p style="margin:16px 0 0; font-size:11px; color:#475569;">© ${new Date().getFullYear()} ${DEFAULT_APP_NAME}</p>
      </div>
    </div>
  </body>
</html>`;

  const text = `${t.headline}
${t.subheadline}

${t.memberNumberLabel}: ${params.memberNumber}
${t.planLabel}: ${params.planName} (${params.planPrice}/${params.planInterval})
${t.validFromLabel}: ${params.memberSince}
${t.validUntilLabel}: ${params.expiresAt}

${t.classificationNote}

${t.trustTitle}:
• ${t.trust1Value} ${t.trust1Label}
• ${t.trust2Value} ${t.trust2Label}
• ${t.trust3Value} ${t.trust3Label}

${t.benefitsTitle}:
• ${t.benefit1}
• ${t.benefit2}
• ${t.benefit3}
• ${t.benefit4}
• ${t.benefit5}

${t.guarantee}

${t.ctaLabel}: ${dashboardUrl}

${t.footer}
"${t.tagline}"

© ${new Date().getFullYear()} ${DEFAULT_APP_NAME}`;

  return {
    subject: t.subject,
    html,
    text,
  };
}

export type { ThankYouLetterParams };
