export type ConfirmationLocale = 'en' | 'sq' | 'mk' | 'sr';

type ThankYouLetterParams = {
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: string;
  expiresAt: string;
  providerReference: string;
  dashboardUrl: string;
  locale: ConfirmationLocale;
};

const TRANSLATIONS = {
  en: {
    subject: 'Membership confirmed',
    headline: 'Your membership is active',
    greeting: 'Hello',
    intro:
      'Paddle reported this membership as active. The details below come from the provider event.',
    statusLabel: 'Provider status',
    statusValue: 'Active',
    memberNumberLabel: 'Member number',
    planLabel: 'Paddle plan',
    priceLabel: 'Provider plan price',
    startsLabel: 'Billing period starts',
    endsLabel: 'Billing period ends',
    referenceLabel: 'Paddle subscription reference',
    nextTitle: 'Next steps',
    nextStatus: 'Review the current status in your membership area.',
    nextCase:
      'To continue a saved first case, open that draft and submit it separately. This email did not submit a case.',
    nextAccess: 'If you still need account access, use the separate secure account-setup email.',
    boundary:
      'This confirmation does not add or change benefits, coverage, refund rights, or terms.',
    cta: 'Open membership',
  },
  sq: {
    subject: 'Anëtarësimi u konfirmua',
    headline: 'Anëtarësimi juaj është aktiv',
    greeting: 'Përshëndetje',
    intro:
      'Paddle e raportoi këtë anëtarësim si aktiv. Të dhënat më poshtë vijnë nga ngjarja e ofruesit.',
    statusLabel: 'Statusi te ofruesi',
    statusValue: 'Aktiv',
    memberNumberLabel: 'Numri i anëtarit',
    planLabel: 'Plani në Paddle',
    priceLabel: 'Çmimi i planit te ofruesi',
    startsLabel: 'Periudha e faturimit fillon',
    endsLabel: 'Periudha e faturimit përfundon',
    referenceLabel: 'Referenca e abonimit në Paddle',
    nextTitle: 'Hapat e ardhshëm',
    nextStatus: 'Shqyrtoni statusin aktual në hapësirën e anëtarësimit.',
    nextCase:
      'Për të vazhduar rastin e parë të ruajtur, hapeni atë draft dhe dorëzojeni veçmas. Ky email nuk dorëzoi asnjë rast.',
    nextAccess:
      'Nëse ju duhet ende qasje në llogari, përdorni emailin e veçantë të sigurt për konfigurimin e llogarisë.',
    boundary:
      'Ky konfirmim nuk shton ose ndryshon përfitime, mbulim, të drejta rimbursimi apo kushte.',
    cta: 'Hap anëtarësimin',
  },
  mk: {
    subject: 'Членството е потврдено',
    headline: 'Вашето членство е активно',
    greeting: 'Здраво',
    intro:
      'Paddle го пријави ова членство како активно. Податоците подолу доаѓаат од настанот на давателот.',
    statusLabel: 'Статус кај давателот',
    statusValue: 'Активно',
    memberNumberLabel: 'Членски број',
    planLabel: 'План во Paddle',
    priceLabel: 'Цена на планот кај давателот',
    startsLabel: 'Периодот за наплата започнува',
    endsLabel: 'Периодот за наплата завршува',
    referenceLabel: 'Референца на претплатата во Paddle',
    nextTitle: 'Следни чекори',
    nextStatus: 'Проверете го тековниот статус во делот за членство.',
    nextCase:
      'За да продолжите со зачуваниот прв случај, отворете го нацртот и поднесете го одделно. Оваа е-пошта не поднесе случај.',
    nextAccess:
      'Ако сè уште ви треба пристап до сметката, користете ја одделната безбедна е-пошта за поставување на сметката.',
    boundary: 'Оваа потврда не додава или менува поволности, покритие, права на поврат или услови.',
    cta: 'Отвори членство',
  },
  sr: {
    subject: 'Članstvo je potvrđeno',
    headline: 'Vaše članstvo je aktivno',
    greeting: 'Zdravo',
    intro:
      'Paddle je prijavio ovo članstvo kao aktivno. Podaci ispod potiču iz događaja provajdera.',
    statusLabel: 'Status kod provajdera',
    statusValue: 'Aktivno',
    memberNumberLabel: 'Članski broj',
    planLabel: 'Plan u Paddle-u',
    priceLabel: 'Cena plana kod provajdera',
    startsLabel: 'Obračunski period počinje',
    endsLabel: 'Obračunski period se završava',
    referenceLabel: 'Referenca Paddle pretplate',
    nextTitle: 'Sledeći koraci',
    nextStatus: 'Proverite trenutni status u odeljku za članstvo.',
    nextCase:
      'Da biste nastavili sa sačuvanim prvim slučajem, otvorite taj nacrt i podnesite ga odvojeno. Ova poruka nije podnela slučaj.',
    nextAccess:
      'Ako vam je i dalje potreban pristup nalogu, koristite posebnu bezbednu poruku za podešavanje naloga.',
    boundary: 'Ova potvrda ne dodaje niti menja pogodnosti, pokriće, prava na povraćaj ili uslove.',
    cta: 'Otvori članstvo',
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderThankYouLetterEmail(params: ThankYouLetterParams) {
  const t = TRANSLATIONS[params.locale];
  const memberName = escapeHtml(params.memberName);
  const dashboardUrl = escapeHtml(params.dashboardUrl);
  const details = [
    [t.statusLabel, t.statusValue],
    [t.memberNumberLabel, params.memberNumber],
    [t.planLabel, params.planName],
    [t.priceLabel, `${params.planPrice} / ${params.planInterval}`],
    [t.startsLabel, params.memberSince],
    [t.endsLabel, params.expiresAt],
    [t.referenceLabel, params.providerReference],
  ] as const;

  const detailRows = details
    .map(
      ([label, value]) => `
        <tr>
          <th scope="row" style="padding:10px 12px; text-align:left; color:#475569; font-size:13px;">${escapeHtml(label)}</th>
          <td style="padding:10px 12px; color:#0f172a; font-size:14px;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="${params.locale}">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0; padding:0; background:#f1f5f9; font-family:Arial,sans-serif;">
    <main style="max-width:600px; margin:0 auto; padding:24px 16px;">
      <div style="background:#0f766e; border-radius:16px 16px 0 0; padding:28px 32px; color:#fff;">
        <h1 style="margin:0 0 10px; font-size:28px;">${escapeHtml(t.headline)}</h1>
        <p style="margin:0; font-size:16px;">${escapeHtml(t.greeting)} ${memberName},</p>
      </div>
      <div style="background:#fff; border:1px solid #cbd5e1; border-top:0; padding:28px 32px;">
        <p style="margin:0 0 20px; line-height:1.6; color:#334155;">${escapeHtml(t.intro)}</p>
        <table style="width:100%; border-collapse:collapse; background:#f8fafc; border:1px solid #e2e8f0;">${detailRows}</table>
        <h2 style="margin:28px 0 12px; font-size:18px; color:#0f172a;">${escapeHtml(t.nextTitle)}</h2>
        <ol style="padding-left:22px; color:#334155; line-height:1.6;">
          <li>${escapeHtml(t.nextStatus)}</li>
          <li>${escapeHtml(t.nextCase)}</li>
          <li>${escapeHtml(t.nextAccess)}</li>
        </ol>
        <p style="margin:20px 0; padding:14px 16px; background:#f8fafc; border-left:4px solid #64748b; color:#334155; line-height:1.5;">${escapeHtml(t.boundary)}</p>
        <p style="margin:24px 0 0; text-align:center;"><a href="${dashboardUrl}" style="display:inline-block; background:#0f766e; color:#fff; text-decoration:none; padding:13px 22px; border-radius:8px; font-weight:700;">${escapeHtml(t.cta)}</a></p>
      </div>
    </main>
  </body>
</html>`;

  const text = `${t.headline}

${t.greeting} ${params.memberName},

${t.intro}

${details.map(([label, value]) => `${label}: ${value}`).join('\n')}

${t.nextTitle}:
1. ${t.nextStatus}
2. ${t.nextCase}
3. ${t.nextAccess}

${t.boundary}

${t.cta}: ${params.dashboardUrl}`;

  return { subject: t.subject, html, text };
}

export type { ThankYouLetterParams };
