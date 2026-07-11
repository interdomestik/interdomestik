import { element, text } from './dom.mjs';

export function renderRecoveryNotice(recovery) {
  if (!recovery) return null;
  const conflict = recovery.code === 'conflict';
  const failed = recovery.code === 'save_failed';
  return element('section', { attributes: { class: 'recovery-notice', role: 'alert' } }, [
    element('h2', {}, [
      text(
        conflict
          ? 'Drafti ndryshoi në një skedë tjetër'
          : failed
            ? 'Ruajtja dështoi'
            : 'Drafti kërkon rikuperim'
      ),
    ]),
    element('p', {}, [
      text(
        conflict
          ? 'Ruajtja automatike u ndal. Ringarko draftin më të ri ose eksporto kopjen lokale.'
          : 'Drafti i ruajtur nuk u fshi. Eksporto të dhënat e paprekura ose fshije qartë.'
      ),
    ]),
    conflict
      ? element('button', { attributes: { type: 'button' }, on: { click: recovery.reload } }, [
          text('Ringarko draftin më të ri'),
        ])
      : null,
    failed
      ? element('button', { attributes: { type: 'button' }, on: { click: recovery.retry } }, [
          text('Provo ruajtjen përsëri'),
        ])
      : null,
    element('button', { attributes: { type: 'button' }, on: { click: recovery.exportLocal } }, [
      text('Eksporto kopjen lokale'),
    ]),
    !conflict && !failed
      ? element('button', { attributes: { type: 'button' }, on: { click: recovery.deleteDraft } }, [
          text('Fshi draftin lokal'),
        ])
      : null,
  ]);
}
