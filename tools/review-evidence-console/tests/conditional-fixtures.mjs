import { bundle as sourceBundle } from './review-session-fixtures.mjs';

export function descriptor(
  key,
  { type = 'text', options = [], required = false, requiredWhen } = {}
) {
  return {
    key,
    labelSq: key,
    type,
    required,
    maxLength: 240,
    options,
    optionLabelsSq: Object.fromEntries(options.map(option => [option, option])),
    ...(requiredWhen ? { requiredWhen } : {}),
  };
}

export const medicalDescriptors = [
  descriptor('medicalBoundary', {
    type: 'select',
    required: true,
    options: ['allowed', 'excluded'],
  }),
  descriptor('disabledScope', {
    requiredWhen: { key: 'medicalBoundary', equals: 'excluded' },
  }),
  descriptor('dpiaRef', {
    type: 'evidenceRef',
    requiredWhen: { key: 'medicalBoundary', equals: 'allowed' },
  }),
  descriptor('reviewerNote'),
];

export function bundleWithDescriptors(descriptors = medicalDescriptors) {
  const bundle = structuredClone(sourceBundle);
  bundle.packet.itemIds = ['item_a'];
  bundle.packet.items = [{ ...bundle.packet.items[0], requiredResponses: descriptors }];
  return bundle;
}
