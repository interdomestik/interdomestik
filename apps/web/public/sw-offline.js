// Public locale text only; catalog parity is enforced by pwa-i18n-contract.test.ts.
const OFFLINE_COPY = {
  en: [
    'You are offline',
    'Reconnect to view your workspace. No cached records are available. Changes are not queued or sent while offline.',
    'Retry',
    'Help Now — offline',
    'Public scene checklist only. No account records, saved photo notes or queued changes.',
    'Country-specific numbers and rules require an online connection.',
    'Someone is hurt: call local emergency services.',
    'No one is hurt: continue the scene checklist.',
    'Checklist, photo prompts and next-step options only. No case is created here.',
    [
      'Move to safety',
      'Turn on hazard lights',
      'Take scene photos',
      'Exchange details',
      'Find witnesses',
      'Do not admit fault',
    ],
  ],
  sq: [
    'Jeni jashtë linje',
    'Rilidhuni për të parë hapësirën tuaj të punës. Nuk ka të dhëna të ruajtura për përdorim jashtë linje. Ndryshimet nuk vendosen në radhë dhe nuk dërgohen jashtë linje.',
    'Provo përsëri',
    'Ndihmë tani — jashtë linje',
    'Vetëm listë publike për vendin e ngjarjes. Pa të dhëna llogarie, shënime të ruajtura për fotografitë apo ndryshime në radhë.',
    'Numrat dhe rregullat specifike për vendin kërkojnë lidhje interneti.',
    'Nëse ka të lënduar, thirrni urgjencën lokale.',
    'Nëse nuk ka të lënduar, vazhdoni listën e vendit të ngjarjes.',
    'Vetëm lista, udhëzime për foto dhe mundësi për hapin e ardhshëm. Këtu nuk hapet asnjë rast.',
    [
      'Dilni në vend të sigurt',
      'Ndizni dritat paralajmëruese',
      'Bëni foto',
      'Shkëmbeni të dhënat',
      'Gjeni dëshmitarë',
      'Mos pranoni fajin',
    ],
  ],
  mk: [
    'Немате интернет-врска',
    'Поврзете се за да го видите работниот простор. Нема зачувани записи. Промените не се ставаат во редица и не се испраќаат без интернет-врска.',
    'Обиди се повторно',
    'Помош веднаш — без интернет',
    'Само јавен список за местото на настанот. Нема записи од сметката, зачувани белешки за фотографии или промени во редица.',
    'Броевите и правилата специфични за земјата бараат интернет-врска.',
    'Ако има повредени, јавете се на локалната итна служба.',
    'Ако нема повредени, продолжете со списокот за местото.',
    'Само список, упатства за фотографии и можности за следен чекор. Тука не се отвора случај.',
    [
      'Преместете се на безбедно',
      'Вклучете четири трепкачи',
      'Фотографирајте',
      'Разменете податоци',
      'Побарајте сведоци',
      'Не признавајте вина',
    ],
  ],
  sr: [
    'Niste povezani na internet',
    'Povežite se da biste videli radni prostor. Nema keširanih podataka. Promene se ne stavljaju u red niti šalju dok ste van mreže.',
    'Pokušaj ponovo',
    'Pomoć odmah — van mreže',
    'Samo javna lista za mesto događaja. Nema podataka naloga, sačuvanih beležaka o fotografijama ni promena na čekanju.',
    'Brojevi i pravila za određenu zemlju zahtevaju internet vezu.',
    'Ako je neko povređen, pozovite lokalnu hitnu službu.',
    'Ako nema povređenih, nastavite listu na mestu događaja.',
    'Samo lista, uputstva za fotografije i mogućnosti za sledeći korak. Ovde se ne otvara slučaj.',
    [
      'Pomerite se na sigurno',
      'Uključite sva četiri migavca',
      'Fotografišite mesto',
      'Razmenite podatke',
      'Pronađite svedoke',
      'Ne priznajte krivicu',
    ],
  ],
  de: [
    'Du bist offline',
    'Verbinde dich mit dem Internet, um deinen Arbeitsbereich zu sehen. Es sind keine zwischengespeicherten Daten verfügbar. Änderungen werden offline weder vorgemerkt noch gesendet.',
    'Erneut versuchen',
    'Soforthilfe — offline',
    'Nur die öffentliche Checkliste für den Unfallort. Keine Kontodaten, gespeicherten Fotonotizen oder vorgemerkten Änderungen.',
    'Länderspezifische Rufnummern und Regeln erfordern eine Internetverbindung.',
    'Jemand ist verletzt: Rufen Sie den örtlichen Notruf an.',
    'Niemand ist verletzt: Fahren Sie mit der Checkliste für den Unfallort fort.',
    'Nur Checkliste, Fotohinweise und Optionen für die nächsten Schritte. Hier wird kein Fall erstellt.',
    [
      'In Sicherheit bringen',
      'Warnblinker einschalten',
      'Fotos vom Unfallort machen',
      'Daten austauschen',
      'Zeugen suchen',
      'Keine Schuld eingestehen',
    ],
  ],
};

function requestLocale(request) {
  const locale = new URL(request.url).pathname.split('/')[1];
  return Object.hasOwn(OFFLINE_COPY, locale) ? locale : 'en';
}

function escapeOfflineText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function localizeOfflineDocument(request, template) {
  if (
    !['locale', 'heading', 'privacy', 'availability', 'checklist'].every(key =>
      template.includes('{{' + key + '}}')
    )
  )
    return offlineNotice(request);
  const locale = requestLocale(request);
  const [, , retry, heading, privacy, availability, emergency, continueSafe, packBody, checklist] =
    OFFLINE_COPY[locale];
  const values = {
    locale,
    retry,
    heading,
    privacy,
    availability,
    emergency,
    continueSafe,
    packBody,
  };
  const html = template.replace(/\{\{(\w+)\}\}/g, (token, key) => {
    if (key === 'checklist')
      return checklist.map(item => `<li>${escapeOfflineText(item)}</li>`).join('');
    return Object.hasOwn(values, key) ? escapeOfflineText(values[key]) : token;
  });
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function offlineNotice(request) {
  const locale = requestLocale(request);
  const [title, body, retry] = OFFLINE_COPY[locale].slice(0, 3).map(escapeOfflineText);
  return new Response(
    `<!doctype html><html lang="${locale}"><meta name="viewport" content="width=device-width">` +
      `<title>${title} | Interdomestik</title><h1>${title}</h1><p>${body}</p>` +
      `<a href="">${retry}</a></html>`,
    {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    }
  );
}

globalThis.pwaOffline = {
  copy: OFFLINE_COPY,
  localizeDocument: localizeOfflineDocument,
  notice: offlineNotice,
};
