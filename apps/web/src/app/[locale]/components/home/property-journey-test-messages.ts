export const propertyJourneyTestMessages = {
  propertyJourney: {
    eyebrow: 'NDIHMË TANI',
    intro: 'Së pari kontrollojmë sigurinë, pastaj organizojmë faktet e dëmit.',
    privacy: 'Përgjigjet nuk ruhen dhe nuk dërgohen.',
    title:
      "A ka ende rrezik aktiv, ose nuk jeni të sigurt nëse prona është e sigurt për t'u përdorur?",
    changeAnswer: 'Ndrysho përgjigjen',
    safety: { yes: 'Po', no: 'Jo', unsure: 'Nuk jam i sigurt' },
    danger: {
      title: 'Largohuni nga rreziku para se të vazhdoni.',
      body: 'Mos hyni dhe mos i riktheni shërbimet derisa ekspertët lokalë të thonë se është e sigurt.',
      emergency:
        'Kontaktoni shërbimin lokal të emergjencës, utility ose sigurisë. Nëse ndodheni në BE, mund të telefononi falas në 112.',
    },
    damage: {
      title: 'Çfarë lloj dëmi ka ndodhur?',
      hint: 'Zgjidhni përshkrimin më të afërt.',
      water: 'Ujë, rrjedhje ose përmbytje',
      fire: 'Zjarr ose tym',
      storm: 'Stuhi ose ngjarje natyrore',
      theft: 'Vjedhje, tentativë vjedhjeje ose vandalizëm',
      product: 'Produkt, pajisje ose instalim',
      other: 'Dëm tjetër',
      unsure: 'Nuk jam i sigurt',
    },
    thirdParty: {
      title: 'A përfshihet një fqinj, qiramarrës ose person tjetër?',
      hint: 'Kjo nuk përcakton fajin ose përgjegjësinë.',
      yes: 'Po',
      no: 'Jo',
      unsure: 'Nuk jam i sigurt',
    },
    role: {
      title: 'Cili është roli juaj në lidhje me pronën?',
      owner: 'Pronar',
      tenant: 'Qiramarrës',
      business: 'Përdorues biznesi',
      acting: 'Po veproj për dikë tjetër me autorizim',
      unsure: 'Nuk jam i sigurt',
    },
    countries: {
      placeholder: 'Zgjidhni shtetin',
      continue: 'Vazhdo',
      propertyTitle: 'Në cilin shtet ndodhet prona?',
      propertyHint: 'Zgjidheni vetë; nuk e përcaktojmë nga gjuha ose vendndodhja.',
      propertyLabel: 'Shteti ku ndodhet prona',
      residenceTitle: 'Në cilin shtet banoni zakonisht?',
      residenceHint: 'Ky mund të jetë shtet tjetër nga vendi i pronës.',
      residenceLabel: 'Shteti i vendbanimit të zakonshëm',
      options: { XK: 'Kosovë', DE: 'Gjermani', IT: 'Itali', OTHER: 'Shtet tjetër' },
    },
    evidence: {
      title: 'Mbroni njerëzit dhe ruani faktet e dëmit.',
      body: 'Bëni vetëm hapa që janë të sigurt. Kjo nuk vendos mbulim, faj ose kompensim.',
      items: {
        safePhotos: 'Fotografi ose video vetëm kur është e sigurt.',
        inventory: 'Listën e sendeve të dëmtuara ose të vjedhura.',
        receipts: 'Faturat, vlerësimet dhe masat urgjente.',
      },
      type: {
        water: 'Kontaktoni utility ose shërbim të kualifikuar kur është e nevojshme.',
        fire: 'Mos hyni përsëri derisa zona të jetë shpallur e sigurt.',
        storm: 'Kufizoni dëmin e mëtejshëm vetëm kur është e sigurt.',
        theft: 'Policia mund të jetë një kontakt i përshtatshëm.',
        product:
          'Ruani produktin kur është i sigurt dhe kontaktoni shitësin, prodhuesin ose shërbimin e kualifikuar.',
        other: 'Ruani datën, vendin dhe faktet që tashmë i dini.',
        unsure: 'Kërkoni inspektim ose orientim të kualifikuar kur lloji nuk është i qartë.',
      },
      thirdParty: 'Ruani mesazhet dhe faktet e kontaktit pa pranuar ose caktuar faj.',
      role: {
        owner: 'Njoftoni siguruesin ose menaxherin e pronës kur është e përshtatshme.',
        tenant: 'Njoftoni pronarin ose menaxherin dhe siguruesin kur është e përshtatshme.',
        business: 'Njoftoni përgjegjësin e objektit dhe siguruesin kur është e përshtatshme.',
        acting:
          'Pronari, menaxheri, siguruesi dhe policia janë kontakte të mundshme paralele; kjo faqe nuk provon autorizimin.',
        unsure: 'Pronari, menaxheri, siguruesi dhe policia janë kontakte të mundshme paralele.',
      },
      diasporaTitle: 'Prona ndodhet jashtë vendit ku banoni?',
      diasporaBody:
        'Rregullat e vendit, policës dhe kontratës kërkojnë shqyrtim të veçantë; nuk supozojmë pse vendet ndryshojnë.',
      handoff: 'Tani fillon intake-i i ri Free Start. Asnjë përgjigje nga ky orientim nuk bartet.',
      continue: 'Organizo të dhënat e dëmit tim',
    },
  },
} as const;
