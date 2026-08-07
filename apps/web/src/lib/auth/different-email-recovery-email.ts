import { sendEmail } from '@interdomestik/domain-communications/email';

export type RecoveryLocale = 'sq' | 'en' | 'sr' | 'mk';
export type RecoveryStage = 'current' | 'replacement';
type Template = { html: string; subject: string; text: string };
type Mailer = (
  to: string,
  template: Template,
  options: { telemetryPolicy: 'content-free' }
) => Promise<{ success: boolean }>;
type Copy = Record<RecoveryStage, { body: string; subject: string }>;

const COPY: Record<RecoveryLocale, Copy> = {
  sq: {
    current: {
      subject: 'Konfirmoni email-in tuaj origjinal',
      body: 'Përdoreni këtë kod për të konfirmuar email-in origjinal. Vlen 5 minuta dhe vetëm kodi më i ri funksionon.',
    },
    replacement: {
      subject: 'Konfirmoni email-in tuaj të ri',
      body: 'Përdoreni këtë kod për të konfirmuar email-in e ri. Vlen 5 minuta dhe vetëm kodi më i ri funksionon.',
    },
  },
  en: {
    current: {
      subject: 'Confirm your original email',
      body: 'Use this code to confirm your original email. It expires in 5 minutes and only the newest code works.',
    },
    replacement: {
      subject: 'Confirm your new email',
      body: 'Use this code to confirm your new email. It expires in 5 minutes and only the newest code works.',
    },
  },
  sr: {
    current: {
      subject: 'Potvrdite prvobitnu e-adresu',
      body: 'Upotrebite ovaj kod da potvrdite prvobitnu e-adresu. Važi 5 minuta i radi samo najnoviji kod.',
    },
    replacement: {
      subject: 'Potvrdite novu e-adresu',
      body: 'Upotrebite ovaj kod da potvrdite novu e-adresu. Važi 5 minuta i radi samo najnoviji kod.',
    },
  },
  mk: {
    current: {
      subject: 'Потврдете ја оригиналната е-пошта',
      body: 'Користете го овој код за да ја потврдите оригиналната е-пошта. Важи 5 минути и работи само најновиот код.',
    },
    replacement: {
      subject: 'Потврдете ја новата е-пошта',
      body: 'Користете го овој код за да ја потврдите новата е-пошта. Важи 5 минути и работи само најновиот код.',
    },
  },
};

export function renderRecoveryEmail(
  locale: RecoveryLocale,
  stage: RecoveryStage,
  code: string
): Template {
  const copy = COPY[locale][stage];
  const text = `${copy.body}\n\n${code}`;
  return {
    subject: copy.subject,
    text,
    html: `<p>${copy.body}</p><p><strong>${code}</strong></p>`,
  };
}

export async function deliverRecoveryCode(
  args: { code: string; email: string; locale: RecoveryLocale; stage: RecoveryStage },
  mailer: Mailer = sendEmail
): Promise<boolean> {
  try {
    const result = await mailer(
      args.email,
      renderRecoveryEmail(args.locale, args.stage, args.code),
      {
        telemetryPolicy: 'content-free',
      }
    );
    return result.success;
  } catch {
    return false;
  }
}
