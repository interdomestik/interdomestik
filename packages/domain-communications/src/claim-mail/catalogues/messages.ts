import type { ClaimMailCopy, ClaimMailLocale, ClaimMailMessage } from '../types';
import { claimMailText } from './text';

export function claimMailMessages(locale: ClaimMailLocale): ClaimMailCopy['messages'] {
  const text = claimMailText(locale);
  const viewClaim = text({
    sq: 'Shiko kërkesën',
    en: 'View claim',
    sr: 'Pogledajte zahtev',
    mk: 'Погледнете го барањето',
    de: 'Fall ansehen',
  });
  const footer = text({
    sq: 'Ekipi i Interdomestik',
    en: 'Interdomestik Team',
    sr: 'Tim Interdomestik',
    mk: 'Тимот на Интердоместик',
    de: 'Das Interdomestik-Team',
  });
  const staffBody = text({
    sq: 'Numri i kërkesës: {claimNumber}\nKategoria: {category}',
    en: 'Claim number: {claimNumber}\nCategory: {category}',
    sr: 'Broj zahteva: {claimNumber}\nKategorija: {category}',
    mk: 'Број на барањето: {claimNumber}\nКатегорија: {category}',
    de: 'Fallnummer: {claimNumber}\nKategorie: {category}',
  });
  const message = (subject: string, body: string, cta = viewClaim): ClaimMailMessage => ({
    subject,
    heading: subject,
    body,
    cta,
    footer,
  });
  return {
    claim_submitted: message(
      text({
        sq: 'E kemi marrë kërkesën tuaj',
        en: 'We received your claim',
        sr: 'Primili smo vaš zahtev',
        mk: 'Го примивме вашето барање',
        de: 'Wir haben Ihren Fall erhalten',
      }),
      text({
        sq: 'Kërkesa juaj „{title}“ është dorëzuar me sukses.\nKategoria: {category}\nID-ja e kërkesës: {claimId}',
        en: 'Your claim "{title}" has been submitted successfully.\nCategory: {category}\nClaim ID: {claimId}',
        sr: 'Vaš zahtev „{title}“ je uspešno podnet.\nKategorija: {category}\nID zahteva: {claimId}',
        mk: 'Вашето барање „{title}“ е успешно поднесено.\nКатегорија: {category}\nИД на барањето: {claimId}',
        de: 'Ihr Fall „{title}“ wurde erfolgreich eingereicht.\nKategorie: {category}\nFall-ID: {claimId}',
      })
    ),
    claim_status_changed: message(
      text({
        sq: 'Statusi i kërkesës u përditësua në {toStatus}',
        en: 'Claim status updated to {toStatus}',
        sr: 'Novi status zahteva je {toStatus}',
        mk: 'Новиот статус на барањето е {toStatus}',
        de: 'Neuer Fallstatus: {toStatus}',
      }),
      text({
        sq: 'Statusi i kërkesës suaj „{title}“ ndryshoi nga {fromStatus} në {toStatus}.\nID-ja e kërkesës: {claimId}',
        en: 'Your claim "{title}" has moved from {fromStatus} to {toStatus}.\nClaim ID: {claimId}',
        sr: 'Status zahteva „{title}“ promenjen je sa {fromStatus} na {toStatus}.\nID zahteva: {claimId}',
        mk: 'Статусот на вашето барање „{title}“ е променет од {fromStatus} во {toStatus}.\nИД на барањето: {claimId}',
        de: 'Der Status Ihres Falls „{title}“ wurde von {fromStatus} auf {toStatus} geändert.\nFall-ID: {claimId}',
      })
    ),
    claim_recovery_decision: {
      accepted: message(
        text({
          sq: 'Procedura e kompensimit u pranua',
          en: 'Recovery accepted',
          sr: 'Postupak naplate je prihvaćen',
          mk: 'Прифатена е постапка за наплата',
          de: 'Rückforderung angenommen',
        }),
        text({
          sq: 'Ekipi pranoi ta trajtojë kërkesën „{title}“ për kompensim.',
          en: 'Staff accepted {title} for recovery handling.',
          sr: 'Naš tim je prihvatio zahtev „{title}“ za postupak naplate.',
          mk: 'Тимот го прифати барањето „{title}“ за постапка за наплата.',
          de: 'Unser Team hat den Fall „{title}“ zur Rückforderung angenommen.',
        })
      ),
      declined: message(
        text({
          sq: 'Procedura e kompensimit u refuzua',
          en: 'Recovery declined',
          sr: 'Postupak naplate je odbijen',
          mk: 'Одбиена е постапка за наплата',
          de: 'Rückforderung abgelehnt',
        }),
        text({
          sq: 'Ekipi refuzoi ta trajtojë kërkesën „{title}“ për kompensim.',
          en: 'Staff declined recovery handling for {title}.',
          sr: 'Naš tim je odbio da pokrene postupak naplate za zahtev „{title}“.',
          mk: 'Тимот одби да поведе постапка за наплата за барањето „{title}“.',
          de: 'Unser Team hat die Rückforderung für den Fall „{title}“ abgelehnt.',
        })
      ),
    },
    claim_message_to_member: {
      full: message(
        text({
          sq: 'Mesazh i ri për kërkesën tuaj',
          en: 'New message on your claim',
          sr: 'Nova poruka o vašem zahtevu',
          mk: 'Нова порака за вашето барање',
          de: 'Neue Nachricht zu Ihrem Fall',
        }),
        text({
          sq: '{sender} dërgoi një mesazh për „{title}“.\n{excerpt}\nID-ja e kërkesës: {claimId}',
          en: '{sender} sent a message about "{title}".\n{excerpt}\nClaim ID: {claimId}',
          sr: '{sender} vam je poslao poruku o zahtevu „{title}“.\n{excerpt}\nID zahteva: {claimId}',
          mk: '{sender} испрати порака за барањето „{title}“.\n{excerpt}\nИД на барањето: {claimId}',
          de: '{sender} hat eine Nachricht zu Ihrem Fall „{title}“ gesendet.\n{excerpt}\nFall-ID: {claimId}',
        }),
        text({
          sq: 'Përgjigju tani',
          en: 'Reply now',
          sr: 'Odgovorite sada',
          mk: 'Одговорете сега',
          de: 'Jetzt antworten',
        })
      ),
      restricted: message(
        text({
          sq: 'Mesazh i ri',
          en: 'New message',
          sr: 'Nova poruka',
          mk: 'Нова порака',
          de: 'Neue Nachricht',
        }),
        text({
          sq: 'Ka një përditësim. Përmbajtja e mesazheve dhe shënimeve është e kufizuar për menaxherët e degëve.',
          en: 'An update is available. Message and note content is restricted for branch managers.',
          sr: 'Dostupno je ažuriranje. Sadržaj poruka i beležaka je ograničen za rukovodioce filijala.',
          mk: 'Достапно е ажурирање. Содржината на пораките и белешките е ограничена за раководителите на филијали.',
          de: 'Eine Aktualisierung ist verfügbar. Nachrichten- und Notizinhalte sind für Filialleiter eingeschränkt.',
        }),
        text({
          sq: 'Hap Interdomestik',
          en: 'Open Interdomestik',
          sr: 'Otvorite Interdomestik',
          mk: 'Отворете го Интердоместик',
          de: 'Interdomestik öffnen',
        })
      ),
    },
    staff_claim_submitted: message(
      text({
        sq: 'U dorëzua një kërkesë e re',
        en: 'New claim submitted',
        sr: 'Podnet je novi zahtev',
        mk: 'Поднесено е ново барање',
        de: 'Neuer Fall eingereicht',
      }),
      staffBody
    ),
    staff_member_message: message(
      text({
        sq: 'Mesazh i ri nga një anëtar',
        en: 'New member message',
        sr: 'Nova poruka od člana',
        mk: 'Нова порака од член',
        de: 'Neue Nachricht eines Mitglieds',
      }),
      staffBody
    ),
  };
}
