export const flightJourneyTestMessages = {
  flightJourney: {
    eyebrow: 'NDIHMË TANI',
    intro: 'Së pari qartësojmë çfarë ju duhet tani, pastaj ruajmë gjurmët e udhëtimit.',
    privacy: 'Përgjigjet nuk ruhen dhe nuk dërgohen.',
    title: 'A jeni ende në aeroport ose duke u përpjekur ta vazhdoni udhëtimin?',
    changeAnswer: 'Ndrysho përgjigjen',
    answers: { yes: 'Po', no: 'Jo', unsure: 'Nuk jam i sigurt' },
    priority: {
      title: 'Kërkoni ndihmën që ju duhet tani.',
      body: 'Kontrolloni kanalin zyrtar të kompanisë që e operon fluturimin dhe kërkoni opsionet me shkrim.',
      expenses:
        'Nëse kompania nuk mund ose nuk pranon t’ju ndihmojë, shënoni çfarë kërkuat dhe ruani faturat e detajuara për shpenzimet e nevojshme dhe të arsyeshme.',
      emergency: 'Për rrezik shëndetësor ose sigurie, kërkoni menjëherë ndihmën lokale.',
    },
    disruption: {
      title: 'Çfarë problemi patët me fluturimin ose bagazhin?',
      hint: 'Zgjidhni situatën më të afërt.',
      delay: 'Fluturimi u vonua',
      cancellation: 'Fluturimi u anulua ose orari ndryshoi ndjeshëm',
      denied: 'Nuk më lejuan të hipja ose kishte overbooking',
      connection: 'Humba lidhjen ose fluturimi u devijua',
      baggage: 'Bagazhi u vonua, humbi ose u dëmtua',
      assistance: 'Ndihma për aftësi të kufizuar ose lëvizshmëri nuk u respektua',
      other: 'Tjetër ose nuk jam i sigurt',
    },
    connection: { title: 'A ishin fluturimet në një rezervim të vetëm?' },
    baggage: { title: 'A e raportuat bagazhin dhe morët një referencë si PIR?' },
    notice: { title: 'A ju dha kompania një njoftim, arsye ose opsion me shkrim?' },
    result: {
      title: 'Merrni hapin e radhës dhe ruani provat.',
      current:
        'Përdorni kanalin zyrtar të kompanisë operuese dhe kërkoni ndihmën ose opsionet me shkrim.',
      complete: 'Kontaktoni me shkrim kompaninë operuese dhe ruani përgjigjen.',
      evidenceTitle: 'Ruani gjurmët e udhëtimit',
      evidence: {
        booking: 'Konfirmimin e rezervimit dhe boarding pass-at.',
        messages: 'Njoftimet e kompanisë dhe kohët reale të nisjes ose mbërritjes.',
        choices: 'Arsyen, njoftimin dhe opsionet që ju janë ofruar.',
        receipts: 'Faturat e detajuara për shpenzimet e nevojshme dhe të arsyeshme.',
      },
      type: {
        delay: 'Ruani kohën reale të mbërritjes dhe kërkoni njoftimin për të drejtat.',
        cancellation:
          'Kërkoni me shkrim opsionet; kjo faqe nuk zgjedh rimbursim ose ri-drejtim për ju.',
        denied: 'Ruani provën se u paraqitët dhe kërkoni arsyen me shkrim.',
        connection: 'Ruani të dy fluturimet dhe faktin nëse ishin në një rezervim.',
        baggage: 'Raportoni shpejt, ruani etiketën e bagazhit dhe referencën PIR.',
        assistance:
          'Kontaktoni menjëherë desk-un e asistencës; siguria dhe shëndeti vijnë të parat.',
        other: 'Kërkoni me shkrim çfarë ka ndodhur dhe cilat opsione janë në dispozicion.',
      },
      conditional: {
        connection_yes:
          'Një rezervim i vetëm mund të jetë fakt i rëndësishëm; kjo faqe nuk vendos të drejtat.',
        connection_no:
          'Biletat e ndara mund të trajtohen ndryshe; mos supozoni të njëjtin rezultat.',
        connection_unsure:
          'Kontrolloni konfirmimin për të parë nëse fluturimet ishin në një rezervim.',
        baggage_yes: 'Ruani referencën e raportit dhe kontrolloni statusin në kanalin zyrtar.',
        baggage_no: 'Raportojeni sa më shpejt; afatet përkatëse mund të jenë të shkurtra.',
        baggage_unsure:
          'Kontrolloni nëse keni një PIR ose referencë dhe raportoni pa vonesë nëse jo.',
        notice_yes: 'Ruani njoftimin dhe çdo opsion të ofruar.',
        notice_no: 'Kërkoni njoftimin, arsyen dhe opsionet me shkrim.',
        notice_unsure: 'Kontrolloni mesazhet dhe kërkoni sqarim me shkrim.',
      },
      diasporaTitle: 'Po udhëtoni mes vendeve?',
      diasporaBody:
        'Rruga, kompania operuese, rezervimi dhe rregullat kërkojnë verifikim të veçantë, pavarësisht shtetësisë ose pasaportës.',
      reform: 'Rregullat e BE-së po ndryshojnë; ndryshimet e korrikut 2026 nuk zbatohen ende.',
      distinctions: 'Ndihma, rimbursimi dhe kompensimi janë pyetje të ndryshme.',
      official: 'Shikoni të drejtat zyrtare të pasagjerëve — hapet faqe e jashtme',
      boundary:
        'Ky orientim është falas. Shërbimi i Interdomestik për ndjekjen e kërkesave të fluturimit nuk është aktiv dhe këtu nuk u krijua asnjë rast.',
    },
    noScript: {
      title: 'Ndihmë për problem me fluturimin',
      body: 'Kontaktoni kompaninë operuese, kërkoni opsionet me shkrim dhe ruani njoftimet e faturat.',
      baggage: 'Për bagazhin, raportoni shpejt dhe ruani etiketën dhe referencën PIR.',
      emergency: 'Për rrezik shëndetësor ose sigurie, kërkoni ndihmë lokale menjëherë.',
      boundary: 'Interdomestik nuk hap rast fluturimi në ofertën aktuale.',
    },
  },
} as const;
