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
}) {
  const item = bundle.packet.items.find(entry => entry.id === state.activeItem);
  if (!item) throw new TypeError('Active review item was not found.');
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
              attributes: { type: 'button', class: 'secondary-action' },
              on: { click: () => onUseGuidance?.(item.id) },
            },
            [text('Përdor si pikënisje')]
          ),
        ]
      ),
      renderDecision({
        item,
        decision,
        onDecision: value => onDecision?.(item.id, value),
        onField: (field, value) => onField?.(item.id, field, value),
        onResponse: (key, value) => onResponse?.(item.id, key, value),
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
  ]);
}
