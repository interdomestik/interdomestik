import { notificationDeliveries, recipientLocales, user } from '@interdomestik/database/schema';
import { describe, expect, it } from 'vitest';
import { LOCALES } from './locales';

// The schema keeps two literal locale lists: the user's preferred locale and the delivery
// locale (a tail table may import only table bindings). Both must equal the catalogue.
describe('stored locale lists', () => {
  it('equal the message catalogue, in order', () => {
    expect(recipientLocales).toEqual(LOCALES);
    expect(user.preferredLocale.enumValues).toEqual([...LOCALES]);
    expect(notificationDeliveries.locale.enumValues).toEqual([...LOCALES]);
  });
});
