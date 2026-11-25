const FREE_START_JOURNEY_CATALOGS = ['freeStartResult', 'injuryJourney', 'propertyJourney'];
const FREE_START_PRICING_CATALOGS = ['commercialTerms', 'coverageMatrix', 'servicesPage'];

/** Builds one registry entry per locale and catalogue. */
function exactLocaleCatalogOwners(owner, namesByLocale) {
  return Object.entries(namesByLocale).flatMap(([locale, names]) =>
    names.map(name => [`${locale}/${name}.json`, owner])
  );
}

// Exact catalogs touched by the Free Start / success fee / opt-in terminology pass.
export const FREE_START_CATALOG_OWNERS = exactLocaleCatalogOwners(
  'free-start-terminology-i18n-contract',
  {
    mk: [...FREE_START_JOURNEY_CATALOGS, ...FREE_START_PRICING_CATALOGS],
    sq: FREE_START_JOURNEY_CATALOGS,
    sr: [...FREE_START_JOURNEY_CATALOGS, ...FREE_START_PRICING_CATALOGS],
  }
);
