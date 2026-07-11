import { element, text } from '../components/dom.mjs';
import { renderDecision } from '../components/decision.mjs';
import { renderEvidenceRail } from '../components/evidence-rail.mjs';
import { renderPacketRail } from '../components/packet-rail.mjs';
import { renderRecoveryNotice } from '../components/recovery-notice.mjs';

export function renderWorkspace({
  bundle,
  state,
  safeEvidenceConfirmed,
  recovery,
  onSelectItem,
  onUseGuidance,
  onDecision,
  onField,
  onResponse,
  onSafeEvidence,
  onValidate,
}) {
  const item = bundle.packet.items.find(entry => entry.id === state.activeItem);
  if (!item) throw new TypeError('Artikulli aktiv i shqyrtimit nuk u gjet.');
  const decision = state.decisions[item.id];
  const canvas = element(
    'section',
    { attributes: { class: 'decision-canvas', 'aria-labelledby': 'item-heading' } },
    [
      element('span', { attributes: { class: 'canonical-id' } }, [text(item.id)]),
      element('h1', { attributes: { id: 'item-heading', tabindex: '-1' } }, [text(item.prompt)]),
      element('p', {}, [element('strong', {}, [text('Nevoja: ')]), text(item.need)]),
      element('p', {}, [element('strong', {}, [text('Ndikimi në repo: ')]), text(item.repoImpact)]),
      element(
        'section',
        { attributes: { class: 'guidance', 'aria-label': 'Udhëzim i sistemit' } },
        [
          element('h2', {}, [text('Udhëzim i sistemit')]),
          element('p', {}, [text(item.guidance)]),
          element(
            'button',
            {
              attributes: {
                type: 'button',
                class: 'secondary-action',
                id: `guidance-start-${item.id}`,
              },
              on: { click: () => onUseGuidance?.(item.id) },
            },
            [text('Përdor si pikënisje')]
          ),
        ]
      ),
      element('p', { attributes: { class: 'reviewer-suggestion-note', role: 'note' } }, [
        text(
          'Disa shënime janë sugjeruar për ta përshpejtuar shqyrtimin; mund t’i ndryshoni ose t’i hiqni.'
        ),
      ]),
      renderDecision({
        item,
        decision,
        onDecision: value => onDecision?.(item.id, value),
        onField: (field, value) => onField?.(item.id, field, value),
        onResponse: (key, value, controlId) => onResponse?.(item.id, key, value, controlId),
      }),
    ]
  );
  return element('div', { attributes: { class: 'workspace' } }, [
    renderRecoveryNotice(recovery),
    renderPacketRail({ packet: bundle.packet, state, onSelectItem }),
    canvas,
    renderEvidenceRail({
      item,
      decision,
      safeEvidenceConfirmed,
      onField: (field, value) => onField?.(item.id, field, value),
      onSafeEvidence,
    }),
    element(
      'button',
      {
        attributes: { type: 'button', class: 'primary-action workspace-submit' },
        on: { click: () => onValidate?.() },
      },
      [text('Shqyrto dhe dërgo')]
    ),
  ]);
}
