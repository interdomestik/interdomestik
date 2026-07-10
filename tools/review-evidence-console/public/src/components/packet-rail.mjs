import { element, text } from './dom.mjs';
import { validateItem } from '../validation/item.mjs';

function itemStatus(item, state) {
  const itemId = item.id;
  const decision = state.decisions[itemId];
  if (itemId === state.activeItem) return ['Në rishikim', 'in-review'];
  if (decision?.decision === 'block') return ['Bllokuar', 'blocked'];
  if (decision?.decision === 'change') return ['Kërkon ndryshim', 'needs-change'];
  if (decision?.decision && validateItem(item, decision).valid) return ['Përfunduar', 'complete'];
  return ['Pa filluar', 'not-started'];
}

export function renderPacketRail({ packet, state, onSelectItem = () => {} }) {
  return element(
    'aside',
    { attributes: { class: 'packet-rail', 'aria-label': 'Hapat e paketës' } },
    [
      element('span', { attributes: { class: 'canonical-id' } }, [text(packet.id)]),
      element('h2', {}, [text('Përparimi i paketës')]),
      element('p', { attributes: { class: 'scope-copy' } }, [text(packet.scope)]),
      element('p', { attributes: { class: 'scope-guard', role: 'note' } }, [
        text('Të dhënat mjekësore nuk lejohen. Ndal nëse shfaqen të dhëna sensitive.'),
      ]),
      element('nav', { attributes: { 'aria-label': 'Artikujt e rishikimit' } }, [
        element(
          'ul',
          { attributes: { class: 'packet-steps' } },
          packet.items.map(item => {
            const [label, status] = itemStatus(item, state);
            return element('li', {}, [
              element(
                'button',
                {
                  attributes: {
                    type: 'button',
                    class: 'packet-step',
                    'data-item-id': item.id,
                    'data-status': status,
                  },
                  on: { click: () => onSelectItem(item.id) },
                },
                [element('strong', {}, [text(item.prompt)]), element('span', {}, [text(label)])]
              ),
            ]);
          })
        ),
      ]),
    ]
  );
}
