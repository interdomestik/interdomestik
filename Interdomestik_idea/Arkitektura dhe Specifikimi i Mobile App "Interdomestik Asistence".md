**Arkitektura dhe Specifikimi i Mobile App "Interdomestik Asistence"**

**I. Përmbledhje**

Aplikacioni "Interdomestik Asistence" synon të transformojë procesin e antarësimit, menaxhimit të kërkesave dhe komunikimit të klientëve me Interdomestik. Duke përdorur teknologjitë më të fundit, aplikacioni do të ofrojë një eksperiencë të thjeshtë, të sigurtë dhe efikase për të gjithë klientët.

**II. Funksionalitetet Ekzistuese (adaptuara për mobile)**

- **Formulari i Antarësimit:** Digjitalizimi i fletëantarësimit ekzistues.
- **Tabela e Kërkesave:** Listimi dhe ndjekja e kërkesave për dëm.
- **Proceset e Aplikimit:** Përpunimi i dokumenteve dhe dërgesa e kërkesave nga klienti.

**III. Funksionalitetet e Reja të Propozuara**

- **Pagesa Online:** Integrim me Stripe për pagesë të antarësimit dhe shërimeve.
- **Chat me Agjentët:** Mundësia për komunikim direkt brenda aplikacionit.
- **Njoftime Push:** Për azhornime në statusin e kërkesave dhe njoftime të personalizuara.
- **Paneli Personal:** Menaxhimi i profilit dhe shikimi i historikut të pagesave.
- **Shërime Personalizuara:** Rekomandime dhe informacione bazuar në profilin e klientit.

**IV. Rrjedha e Përdoresit (User Flow)**

1.  Hapja e aplikacionit.
2.  Regjistrimi ose Hyrja.
3.  Plotësimi i Formularit të Antarësimit.
4.  Pagesa e Antarësimit.
5.  Përdorimi i shërimeve:
    - Dërgesa e kërkesave për dëm.
    - Ndjekja e statusit të kërkesave.
    - Komunikimi me agjentët.
6.  Menaxhimi i profilit.

**V. Mockup Screenshots (Përshkrimi i Pamjeve)**

- **Home Screen:** Logo, slogan "Se bashku është më lehtë", buton "ANTARESOHU".
- **Formular Antarësimi:** Multi-step form me hapa të qartë.
- **Ekrani i Pagesës:** Shuma dhe buton "Paguaj Tani".
- **Status i Kërkesave:** Lista e kërkesave me status badge.
- **Chat Screen:** Flluska komunikimi dhe fusha e mesazhit.
- **Profile Screen:** Të dhënat personale dhe menaxhimi i preferencave.

**VI. Teknologjitë e Sugjeruara**

- **Frontend:**
  - React Native (aplikacion cross-platform për iOS dhe Android).
  - Expo për zhvillim dhe testim të shpejtë.
- **Backend:**
  - Firebase Authentication (hyrje dhe regjistrim).
  - Firebase Firestore (ruajtja e të dhënave të kërkesave).
  - Firebase Cloud Messaging (njoftime push).
  - Stripe API (menaxhimi i pagesave).

**VII. Arkitektura Teknike**

**1\. Aplikacioni Mobile (Client Side)**

- I ndërtuar me React Native.
- Integron module për autentifikim, pagesa, dhe komunikim real-time.

**2\. Backend (Server Side)**

- Firebase si backend kryesor.
- Firestore database për ruajtje dokumentesh dhe statuse kërkesash.
- Server Functions për procesim logjik të njoftimeve.

**3\. Integrimet Ekstra**

- Stripe: për procesimin e pagesave të sigurta.
- API të personalizuara për ndërlidhjen me sistemin e brendshëm Interdomestik.

**4\. Siguria**

- SSL/TLS Encryption.
- Autorizim me role për aksesimin e të dhënave.
- Ruajtja e të dhënave në fushën private të Firebase.

**Ky dokument është i gatshëm për të vazhduar me zhvillimin real dhe projektimin final të aplikacionit.**

cka duhet te kemi parasyshe gjate zhvillimit real dhe projektimit final te aplikacionit

**Udhëzues për Zhvillimin dhe Projektimin Final të Mobile App "Interdomestik Asistence"**

**1\. Kërkesat Funksionale dhe Jo-funksionale**

- Dokumentim i qartë i funksioneve të aplikacionit.
- Përshkrimi i performancës, sigurisë dhe stabilitetit të pritshëm.
- Për shembull: Njoftimet push duhet të arrijnë brenda 2 sekondave.

**2\. Eksperienca e Përdoresit (UX) dhe Dizajni i Pastër (UI)**

- Dizajn minimalist dhe intuitiv.
- Përvoja me sa më pak hapa për antarësim, pagesë dhe përpunim kërkesash.
- Përdorimi i font-eve të lexueshme dhe ikonave miqësore.
- Testim paraprak me përdores real për feedback.

**3\. Siguria dhe Privatësia e të Dhënave**

- Përdorimi i autentifikimit të sigurt (Firebase Authentication).
- Enkriptimi i komunikimeve me SSL/TLS.
- Respektimi i GDPR dhe ligjeve lokale për privatësi.

**4\. Arkitekturë Teknike e Qëndrueshme**

- Strukturë modulare e kodit (screens, components, services).
- Shërbime backend skalueshme (Firebase Firestore + Functions).
- API të ndara dhe dokumentuara qartë.

**5\. Testimi i Plotë (QA)**

- Testim funksional për çdo funksion.
- Testim UX/UI për përvojë të rrjedhshme.
- Testim i ngarkesës dhe i sigurisë.

**6\. Integrimi me Sistemet e Interdomestik**

- Sinkronizimi i aplikacionit me sistemin aktual të menaxhimit të kërkesave.
- Ruajtja e koherencës së të dhënave midis aplikacionit dhe serverit.

**7\. Monitorimi dhe Analitika pas Publikimit**

- Integrimi i Firebase Analytics për monitorim.
- Përdorimi i Firebase Crashlytics për zbulimin e crasheve.
- Matja e metrikave si: antarësime të reja, aktivitete në aplikacion.

**8\. Mirëmbajtja dhe Përditësimet**

- Planifikimi i versioneve të reja me funksionalitete të shtuara.
- Përditësim i rregullt bazuar në feedback-un e përdoresve.

**9\. Kosto dhe Burime**

- Përllogaritja e buxhetit për zhvillim, marketing dhe mirëmbajtje.
- Menaxhimi i burimeve në përputhje me fazat e projektit.

**10\. Publikimi në App Store dhe Google Play**

- Përgatitja e materialeve marketingu (screenshots, përshkrime).
- Përputhshmërësia me kushtet e App Store dhe GDPR.

**11\. Konkluzion Strategjik**

Suksesi i aplikacionit "Interdomestik Asistence" varet nga:

- Një eksperiencë përdoresit e thjeshtë dhe intuitive.
- Siguria dhe mbrojtja e të dhënave.
- Menaxhimi aktiv i përditësimeve dhe reagimi ndaj feedback-ut.

**Ky udhëzues është orientimi themelor për zhvillimin profesional dhe qëndrueshmër të aplikacionit mobile.**
