import type { HelpNowContentLocale } from './content-packs';

export type HelpNowCopy = {
  title: string;
  subtitle: string;
  offline: string;
  emergency: string;
  continueSafe: string;
  darkTitle: string;
  darkBody: string;
  privacy: string;
  clear: string;
  download: string;
  downloadDone: string;
  packTitle: string;
  packBody: string;
  scenarios: readonly string[];
  checklist: readonly string[];
  shots: readonly string[];
  tripChecklist: readonly string[];
};

const en: HelpNowCopy = {
  title: 'What happened?',
  subtitle: 'Roadside help that works before account creation.',
  offline: 'Public pack can be saved offline. Local bundle never uploads.',
  emergency: 'Someone is hurt: call local emergency services.',
  continueSafe: 'No one is hurt: continue the scene checklist.',
  darkTitle: 'Country pack awaiting L2 sign-off',
  darkBody:
    'Country-specific numbers and police thresholds stay dark until a named reviewer signs the pack version.',
  privacy:
    'Photo selections are recorded only as local metadata; originals stay under your control.',
  clear: 'Clear local bundle',
  download: 'Download public Trip Mode pack',
  downloadDone: 'Public pack saved for offline use.',
  packTitle: 'Free Claim Pack preview',
  packBody: 'Checklist, evidence prompts, and handoff options only. No case is created here.',
  scenarios: ['Car accident', 'Injury', 'Property damage', 'Flight: coming soon'],
  checklist: [
    'Move to safety',
    'Turn on hazard lights',
    'Take scene photos',
    'Exchange details',
    'Find witnesses',
    'Do not admit fault',
  ],
  shots: [
    'Wide scene',
    'Number plates',
    'Damage close-up',
    'Road context',
    'Documents',
    'Witness notes',
  ],
  tripChecklist: ['Green Card', 'EAS form', 'Vehicle documents', 'Family contact', 'Offline pack'],
};

const sq: HelpNowCopy = {
  ...en,
  title: 'Çfarë ndodhi?',
  subtitle: 'Ndihmë në rrugë para hapjes së llogarisë.',
  emergency: 'Nëse ka të lënduar, thirrni urgjencën lokale.',
  continueSafe: 'Nëse nuk ka të lënduar, vazhdoni listën e vendit të ngjarjes.',
  privacy:
    'Zgjedhjet e fotove ruhen vetëm si metadata lokale; origjinalet mbeten nën kontrollin tuaj.',
  clear: 'Fshi paketën lokale',
  download: 'Shkarko paketën publike Trip Mode',
  downloadDone: 'Paketa publike u ruajt për përdorim offline.',
  scenarios: ['Aksident me veturë', 'Lëndim', 'Dëm prone', 'Fluturim: së shpejti'],
  checklist: [
    'Dilni në vend të sigurt',
    'Ndizni dritat paralajmëruese',
    'Bëni foto',
    'Shkëmbeni të dhënat',
    'Gjeni dëshmitarë',
    'Mos pranoni fajin',
  ],
};

const mk: HelpNowCopy = {
  ...en,
  title: 'Што се случи?',
  subtitle: 'Помош на пат пред отворање сметка.',
  emergency: 'Ако има повредени, јавете се на локалната итна служба.',
  continueSafe: 'Ако нема повредени, продолжете со списокот за местото.',
  privacy:
    'Изборите на фотографии се бележат само како локални metadata; оригиналите остануваат под ваша контрола.',
  clear: 'Исчисти локален пакет',
  download: 'Преземи јавен Trip Mode пакет',
  downloadDone: 'Јавниот пакет е зачуван за offline употреба.',
  scenarios: ['Сообраќајка', 'Повреда', 'Имотна штета', 'Лет: наскоро'],
  checklist: [
    'Преместете се на безбедно',
    'Вклучете четири трепкачи',
    'Фотографирајте',
    'Разменете податоци',
    'Побарајте сведоци',
    'Не признавајте вина',
  ],
};

const sr: HelpNowCopy = {
  ...en,
  title: 'Šta se dogodilo?',
  subtitle: 'Pomoć na putu pre otvaranja naloga.',
  emergency: 'Ako je neko povređen, pozovite lokalnu hitnu službu.',
  continueSafe: 'Ako nema povređenih, nastavite listu na mestu događaja.',
  privacy:
    'Izbori fotografija se beleže samo kao lokalni metadata; originali ostaju pod vašom kontrolom.',
  clear: 'Obriši lokalni paket',
  download: 'Preuzmi javni Trip Mode paket',
  downloadDone: 'Javni paket je sačuvan za offline upotrebu.',
  scenarios: ['Saobraćajna nezgoda', 'Povreda', 'Šteta na imovini', 'Let: uskoro'],
  checklist: [
    'Pomerite se na sigurno',
    'Uključite sva četiri migavca',
    'Fotografišite mesto',
    'Razmenite podatke',
    'Pronađite svedoke',
    'Ne priznajte krivicu',
  ],
};

const de: HelpNowCopy = {
  ...en,
  title: 'Was ist passiert?',
  subtitle: 'Hilfe unterwegs, bevor ein Konto nötig ist.',
  emergency: 'Wenn jemand verletzt ist, rufen Sie den lokalen Notdienst.',
  continueSafe: 'Niemand ist verletzt: weiter mit der Unfall-Checkliste.',
  privacy:
    'Fotoauswahlen werden nur als lokale Metadaten notiert; Originale bleiben unter Ihrer Kontrolle.',
  clear: 'Lokales Paket löschen',
  download: 'Öffentliches Trip-Mode-Paket speichern',
  downloadDone: 'Öffentliches Paket wurde offline gespeichert.',
  scenarios: ['Autounfall', 'Verletzung', 'Sachschaden', 'Flug: bald'],
};

const COPY: Record<HelpNowContentLocale, HelpNowCopy> = { en, sq, mk, sr, de };

export function getHelpNowCopy(locale: HelpNowContentLocale): HelpNowCopy {
  return COPY[locale];
}
