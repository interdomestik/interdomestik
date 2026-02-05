**Manual Teknik për Zhvilluesit – Aplikacioni “Interdomestik Asistence”**

Ky dokument përmban udhëzime të hollësishme për zhvillimin e aplikacionit mobil "Interdomestik Asistence" (iOS & Android) me **React Native**. Manuali mbulon funksionalitetet, strukturën e ekranëve, organizimin e bazës së të dhënave, integrimin me Firebase (Auth, Firestore, Messaging) dhe Stripe, arkitekturën e kodit, praktikat e sigurisë dhe skenarët e testimit.

**1\. Përshkrimi i Funksionaliteteve**

**“Interdomestik Asistence”** ofron shërbim ndërmjetësimi në dëme sipas modelit **“no win – no fee”**. Kjo do të thotë se anëtari nuk paguan asnjë tarifë nëse kërkesa e tij për dëm nuk miratohet. Aplikacioni është **dygjuhësh (Shqip dhe Maqedonisht)** dhe ofron **eksperiencë optimale mobile** për funksionalitetet kryesore të sistemit web ekzistues, si formulari i anëtarësimit dhe pasqyrimi i statuseve të kërkesave.

**Përmbledhje e moduleve kryesore:**

- **Home (Ekrani kryesor informues):** Shfaq shkurtimisht shërbimin (p.sh. motoja *“Së bashku është më lehtë”*) dhe shpjegon modelin “no win – no fee”. Përmban një buton të dukshëm “Antarsohu” për nisjen e procesit të anëtarësimit.
- **Regjistrimi / Hyrja:** Mundëson krijimin e llogarisë së re ose hyrjen në llogari ekzistuese. Përdor Firebase Auth për **email & fjalëkalim**, me **verifikim email** pas regjistrimit. Pas suksesi, ruhet sesioni dhe token-i i përdoruesit për kërkesat e ardhshme​file-9ubfugm1gyje1rm6sdembd.
- **Formulari i Anëtarësimit (antarësimi):** Formular **disa-hapësh interaktiv** për grumbullimin e të dhënave personale, adresës, kontaktit, preferencave marketing dhe pranimit të kushteve të shërbimit. Secili hap ruan inputet (p.sh. me **Context API** ose **Redux**) deri në finalizim​file-9ubfugm1gyje1rm6sdembd.
- **Pagesa e Anëtarësimit:** Pas plotësimit të formularit, përdoruesi pranon kushtet dhe kryen pagesën e tarifës vjetore (p.sh. **10€** ose ofertë promocionale p.sh. **5€**). Integrimi bëhet me **Stripe** për pagesa online. Një buton “Paguaj” nis procesin e pagesës dhe pas suksesit ruhet statusi i pagesës.
- **Konfirmimi:** Pas dërgimit të formularit dhe pagesës, shfaqet një ekran konfirmimi me një **ID reference** unike për anëtarësimin e ri. Një email konfirmimi dërgohet automatikisht përdoruesit.
- **Statusi i Kërkesave:** Përdoruesi mund të ndjekë **statusin e kërkesave për dëme** (nëse ka autorizuar ndërmjetësim). Ekrani liston të gjitha kërkesat e paraqitura (me ID dhe datë) dhe statusin e tyre aktual: p.sh. *E dërguar*, *Në përpunim*, *Miratuar*, *Refuzuar*, *e Paguar*​file-9ubfugm1gyje1rm6sdembd. Aplikacioni ofron **pull-to-refresh** për rifreskimin e statuseve​file-9ubfugm1gyje1rm6sdembd.
- **Chat (Mbështetje):** Module opsional i bisedës për komunikim **përdorues – operator**. Përdor Firestore për mesazhe në kohë reale. Përdoruesi mund të bëjë pyetje dhe të marrë përgjigje nga stafi mbështetës në kohë reale. Mesazhet ruhen me detaje si dërguesi, marrësi, përmbajtja dhe timestamp.
- **Profili (Llogaria Ime):** Lejon menaxhimin e të dhënave personale dhe preferencave:
  - **Të dhënat personale:** Emër, Email, Telefon (me mundësi ndryshimi).
  - **Fjalëkalimi:** Opsion për ndryshimin e fjalëkalimit (me verifikim të fjalëkalimit të vjetër).
  - **Historiku i anëtarësimeve/kërkesave:** Lista e të gjitha kërkesave të paraqitura me statuset përkatëse​file-9ubfugm1gyje1rm6sdembd.
  - **Detajet e pagesës:** Ruajtja ose përditësimi i informacionit bankar (p.sh. IBAN) për derdhjen e kompensimit pas pranimit të kërkesës.
  - **Cilësimet e njoftimeve:** Aktivizimi/deaktivizimi i njoftimeve push për llogarinë.
  - **Dil/Hyr:** Mundësi për të dalë nga llogaria (logout) dhe ruajtja e gjendjes së hyrjes për seancat e ardhshme (p.sh. me AsyncStorage).

**2\. Udhëzime për Ndërtimin e Ekraneve**

Për secilin ekran të aplikacionit, jepen udhëzime për dizajnin dhe komponentët kryesorë:

**2.1. Ekrani Home (Kryesor)**

- **Përmbajtja:** Logo ose imazh i shkurtër për shërbimin, moto e kompanisë, dhe një përshkrim i shkurtër i modelit “no win – no fee” në 1-2 fjali. Sigurohuni që përshkrimi të theksojë se anëtarësimi nuk ka kosto nëse nuk fitohet kompensimi.
- **Butoni kryesor:** ANTARSOHU – buton me stilim të dukshëm (p.sh. ngjyrë e dallueshme) që dërgon në **Formularin e Anëtarësimit**.
- **Footer opsional:** Butona “Hyr / Regjistrohu” nëse përdoruesi s’ka hyrë ende. Në të kundërt, shfaq një përshëndetje (“Mirësevjen, \[Emri\]”) dhe ndoshta një **ikonë Profile**.

**Shënim Zhvillimi:** Home mund të jetë një **component** i thjeshtë me tekste statike (për gjuhën SHQ/MK përdorni skedarë lokalizimi). Butoni “Antarsohu” bën navigate (React Navigation) te ekrani i formularit.

**2.2. Ekrani Regjistrimi / Hyrja**

- **Regjistrimi:** Formë me fushat:
  - Email
  - Fjalëkalim
  - Konfirmo Fjalëkalimin  
    Gjatë regjistrimit përdorni createUserWithEmailAndPassword të Firebase Auth​[rnfirebase.io](https://rnfirebase.io/auth/usage#:~:text=both%20register%20and%20sign%20in,signInWithEmailAndPassword). Pas suksesit, user-i lidhet (login) automatikisht ose i dërgohet email verifikimi. Këtu mund të shfaqet mesazh suksesi (“Llogaria u krijua me sukses!”).
- **Hyrja (Login):** Formë me fushat:
  - Email
  - Fjalëkalim  
    Kryeni verifikimin me signInWithEmailAndPassword. Në rast gabimi (p.sh. kredenciale të pasakta), shfaqni mesazh gabimi.
- **Validimet:** Sigurohuni që email-i të ketë format të vlefshëm dhe fjalëkalimi të përmbushë kritere sigurie (p.sh. ≥8 karaktere, numra/simbole).
- **Butona shtesë:** “Harrove fjalëkalimin?” që nis procesin e resetimit të fjalëkalimit (opsionale, me sendPasswordResetEmail).
- **Dizajni:** Mbajeni të thjeshtë. Përdorni **TextInput** për fusha, **Button** ose **TouchableOpacity** për veprime. Vendosni etiketat në shqip (“Email”, “Fjalëkalim”, “Hyr”).

**Shënim teknologjik:** Firebase Auth ruan sesionin e user-it automatikisht pas login; ky sesion ruhet edhe pas rifillimit të app-it. Për të fshirë sesionin, user mund të kryejë auth().signOut(). Përdorni state menaxhimin (Context API ose AsyncStorage/SecureStore) për të ruajtur ID-në e user-it ose token-in JWT (nëse përdoret server personal).

**2.3. Formulari i Anëtarësimit**

Ky është procesi kryesor, prandaj implementohet me **hapa të shumëfishtë (multi-step form)** për të mos e mbingarkuar përdoruesin:

**Hapat e formularit:**

1.  **Të dhënat personale:**
    - Emri
    - Mbiemri / Emri i Kompanisë
    - Adresa (rruga, nr., qyteti)
    - Kontakt (telefoni celular)
    - Email (parapopullohet nëse user është regjistruar)
    - Preferenca marketing (checkbox *“Pranoj material promocional (email, SMS)”*)
    - ***Validime:*** Fushat e detyrueshme duhet të plotësohen. Email të jetë unik (kontrollo në Firestore users). Telefon formati +355/+383/+389.
2.  **Deklarata e Pajtueshmërisë & Kushtet:**
    - Shfaq tekstin e deklaratës për përpunimin e të dhënave personale sipas ligjit për mbrojtjen e të dhënave.
    - Checkbox “Jam dakord me kushtet e anëtarësimit” (must be checked për të vazhduar).
    - Butoni “Vazhdo tek Pagesa”.
3.  **Pagesa e Anëtarësimit:**
    - Shfaqni përmbledhjen e të dhënave të futura për rishikim.
    - Tregoni shumën e pagesës që do të paguhet (p.sh. “Tarifa vjetore: 10€” – mundësi për **kupon zbritjeje** nëse aplikohet).
    - Butoni “Paguaj me Kartë” që hap **formularin e pagesës Stripe**. (Shih seksionin *Integrimi Stripe* më poshtë.)
4.  **Konfirmimi Final:**
    - Nëse pagesa kryhet me sukses, dërgoni të dhënat në backend (Firebase Functions) për të **krijuar dokumentin e anëtarësimit** dhe regjistroni pagesën.
    - Merrni mbrapsht një **ID anëtarësimi** ose referencë (p.sh. membershipId) për ta shfaqur në ekran.
    - Shfaqni mesazh: “Anëtarësimi u krye me sukses! ID juaj: XYZ12345. Do të merrni një email me detajet.”.
    - Butoni “Shko te Statuset” për të parë statusin e kërkesave (ose *“Kthehu në Home”*).

**Implementimi teknik:** Përdorni **React Navigation** (Stack Navigator) për të realizuar kalimin midis hapave si ekrane të veçanta brenda modulit të formularit. Alternativë, mund të përdorni një komponent të vetëm me **shtegun (step)** në state dhe elementë që fshihen/shfaqen.

- **Data handling:** Pasi përdoruesi plotëson çdo hap, ruani të dhënat në **Context (React Context API)** ose një menaxher global (Redux/Zustand)​file-9ubfugm1gyje1rm6sdembd. Kështu në hapin e fundit keni qasje në të gjitha fushat e mbledhura.
- **Dërgimi:** Në hapin e fundit, kur përdoruesi shtyp “Paguaj” / “Dërgo”, bëhet:
  1.  **Krijimi i Payment Intent** (në Cloud Function) dhe konfirmimi i pagesës (front-end Stripe SDK).
  2.  **Krijimi i dokumentit** në Firestore koleksioni requests (ose memberships) me status fillestar “Në shqyrtim”.
  3.  **Rezultimi:** Cloud Function e pagesës kthen një response (p.sh. sukses me ID, ose error). Në front-end, kapni përgjigjen:
      - Sukses: Shfaq ekranin e konfirmimit me ID reference.
      - Error: Njoftoni përdoruesin dhe jepni mundësi riprovimi.

**UI/UX këshillë:** Siguroni një **progress indicator** (p.sh. vijë progresi apo hapa me numra 1-2-3-4 në krye të ekranit) që përdoruesi të dijë në cilin hap ndodhet.

**2.4. Ekrani i Pagesës**

Ky ekran lidhet ngushtë me hapin final të formularit të anëtarësimit. Mund të realizohet me **Stripe React Native SDK** (preferohet **stripe-react-native** zyrtar ose tipsi-stripe sipas nevojës):

- **Kartë Krediti/Debiti:** Përdorni komponentin e Stripe për të marrë informacionin e kartës (numri, skadenca, CVV) në mënyrë të sigurt. Stripe ofron një element të quajtur CardField ose CardForm për RN.
- **Butoni Paguaj:** Pas vendosjes së të dhënave të kartës, shtypja e butonit “Paguaj” do të:
  1.  Krijojë një **Payment Intent** përmes një **Firebase Function** që thërret API-në e Stripe (shih seksionin Backend më poshtë). Cloud Function kthen një client_secret.
  2.  Me client_secret, front-end RN përdor confirmPayment të Stripe SDK për të ekzekutuar pagesën me kartën e futur.
  3.  Stripe SDK menaxhon hapjen e UI-ve native (p.sh. Apple Pay, 3D Secure) nëse kërkohet verifikim shtesë.
- **Trajtimi i rezultatit:** Nëse pagesa konfirmohet, merrni detajet e pagesës (p.sh. paymentIntent.id, status = "succeeded"). Mund të ruani paymentId në Firestore (koleksioni payments).
- **Siguria:** Kartat **NUK** duhen ruajtur kurrë në server; Stripe merret vetë me tokenizimin. Firebase Functions do përdorë çelësin sekret Stripe të ruajtur në konfigurim​[firebase.google.com](https://firebase.google.com/docs/tutorials/payments-stripe#:~:text=7,your%20Cloud%20Functions%20environment%20configuration) për të krijuar PaymentIntent. Front-end do të përdorë vetëm çelësin publik (publishable key).

**Shembull integrimi Stripe (pseudokod):**

javascript

Copy

_// On Pay button click in RN:_ const { clientSecret } = await api.createPaymentIntent({ amount: 10\*100, currency: 'EUR' }); const billingDetails = { email: user.email, name: fullName }; const result = await confirmPayment(clientSecret, { paymentMethodType: 'Card', billingDetails }); if(result.status === 'Succeeded') { _// Payment successful_ const membershipId = await api.createMembershipRecord({ userId, data: {...} }); navigate('Confirmation', { membershipId }); } else { _// Payment failed_ Alert.alert("Pagesa dështoi", result.error.message); }

**2.5. Ekrani Statusi i Kërkesave**

- **Përmbajtja:** Liston të gjitha kërkesat e përdoruesit (anëtarësimet apo pretendimet e dëmshpërblimit) me **ID referencë**, **datë** dhe **status aktual**​file-9ubfugm1gyje1rm6sdembd. P.sh. “Kërkesa #12345 – *Në përpunim*” ose “Kërkesa #98765 – *E paguar*”.
- **Marrja e të dhënave:** Lexoni nga Firestore koleksioni requests **vetëm dokumentet e user-it loguar**. Përdorni query: requests.where('userId','==',currentUser.uid). Aplikoni **security rules** që një user të lexojë vetëm kërkesat e veta (shih seksionin siguria).
- **Detaje shtesë:** Pasi zgjedh një kërkesë nga lista, mund të hapet një ekran detajesh që shfaq informacione më të hollësishme, p.sh. data e krijimit, përshkrimi i dëmit, komentet nga stafi (nëse ka).
- **UI:** Përdorni një **FlatList** për listimin. Çdo element i listës të jetë një **kartë** me titull (p.sh. “Kërkesa ID”) dhe nën-titull statusi. Mund të përdorni ngjyra për statuset (p.sh. e verdhë për “Në përpunim”, jeshile për “Miratuar”, e kuqe për “Refuzuar”, blu për “E paguar”).
- **Refresh:** Implementoni **pull-to-refresh** për të rifreskuar listën nga serveri. Gjithashtu, integroni **Firebase Cloud Messaging** që kur ndryshon një status në server, përdoruesi merr **njoftim push** dhe lista rifreskohet automatikisht (p.sh. me event listener ose thjesht me notifikim vizual).

**2.6. Ekrani Chat (Bisedë)**

_(Opsional sipas nevojave, por në manual e përfshijmë)_

- **Funksionaliteti:** Përdoruesi mund të dërgojë mesazhe për pyetje apo ndihmë dhe ekipi mbështetës t’i përgjigjet. Implementohet chat **one-to-one** (përdoruesi me një llogari admin).
- **UI:** Dritare chat e ngjashme me aplikacionet e mesazheve: fushë inputi poshtë, buton “Dërgo”, dhe bubbles mesazhesh në listë (djathtas mesazhet e user-it, majtas ato të admin-it).
- **Baza e të dhënave:** Struktura Firestore:
  - Koleksioni messages me dokumente mesazhesh ose një strukturë më e organizuar:
    - threads (ose conversations) ku secili thread ka ID unike (p.sh. ID user-i ose një ID e kombinuar).
    - Nën secilin thread, një subkoleksion messages ku secili dokument ka fushat:
      - senderId (uid i dërguesit),
      - text (përmbajtja),
      - timestamp (server timestamp),
      - receiverId (opsionale, ose deduktohet nga thread).
    - **Shembull JSON:**

json

Copy

_// Koleksioni threads:_ "threads": { "thread*12345": { "participants": \["uid_user", "uid_admin"\], "createdAt": "...", "lastMessage": "Miremengjes" } }, *// Subkoleksion messages nën thread*12345:* "threads/thread_12345/messages": { "msg1": { "senderId": "uid_user", "text": "Pershendetje, kam nje pyetje...", "timestamp": 1683012345678 }, "msg2": { "senderId": "uid_admin", "text": "Pershendetje, si mund t\\u00eb ndihmoj?", "timestamp": 1683012378901 } }

- **Realtime update:** Përdorni Firestore **snapshot listener** (p.sh. onSnapshot) për subkoleksionin e mesazheve, që çdo mesazh i ri të shfaqet menjëherë pa rifreskim manual.
- **Dërgimi i mesazhit:** Kur përdoruesi shtyp “Dërgo”, shtoni një dokument të ri te messages me senderId = currentUser.uid dhe receiverId = adminUid (ose përdorni fushë isAdmin: true/false për të dalluar).
- **Njoftimet:** Në backend, një **Cloud Function** Firestore trigger mund të dëgjojë shtimin e mesazheve të reja në messages dhe të dërgojë **FCM push** te marrësi nëse është offline.

**2.7. Ekrani Profili (Llogaria Ime)**

- **Struktura:** Përdorni seksione ose **tabs** brenda ekranit profil për kategorizim:
  1.  **Të dhënat personale:** Fushat e redaktueshme për emër, mbiemër, email, telefon. Mundëso onPress për secilën fushë që hap një modal ose ekran të vogël për modifikim dhe ruajtje.
  2.  **Ndrysho Fjalëkalimin:** Fusha për fjalëkalim të vjetër, fjalëkalim të ri, konfirmim. Përdor Firebase Auth (updatePassword) – kërkohet që user të jetë riloguar së fundmi për veprime sensitive, ndaj mund të kërkohet re-auth.
  3.  **Historiku i kërkesave:** Mund të embed-oni komponentin e listës së statuseve (si te 2.5) ose një link drejt ekranit “Statusi i Kërkesave”.
  4.  **Detajet e pagesës:** Forma për të ruajtur p.sh. IBAN ose numër llogarie bankare. Ruajeni në Firestore brenda dokumentit të user-it (koleksioni users, fusha iban ose bankAccount).
  5.  **Cilësimet:** Toggle për njoftimet push (ruhet në Firestore users.notificationEnabled: true/false). Nëse çaktivizohet, mund të fshini token-in FCM ose të përdorni messaging().unsubscribeFromTopic('all').
  6.  **Dil:** Buton “Dil nga llogaria” që thërret auth().signOut() dhe pastron të dhënat sensitive lokale (p.sh. token, AsyncStorage). Pas daljes, ridrejto te ekrani i hyrjes.
- **UI/UX:** Përdorni një **ScrollView** nëse përmbajtja është e gjatë. Secili seksion mund të prezantohet me një <Text> titullor dhe komponentët përkatës (p.sh. switch për njoftime, buton për dil). Mbani konsistencë ngjyrash dhe stilesh me pjesën tjetër të aplikacionit.

**3\. Struktura e Bazës së të Dhënave (Firebase Firestore)**

Aplikacioni përdor **Cloud Firestore** për ruajtjen e të dhënave. Më poshtë paraqiten koleksionet kryesore dhe strukturat e dokumenteve, së bashku me tipe të dhënash dhe shembuj JSON:

**3.1. Koleksioni** users

**Përdorim:** Ruajtja e profileve të përdoruesve (anëtarëve të aplikacionit). Firebase Auth ruan vetëm emailin dhe uid, ndërsa Firestore users do ruajë detaje shtesë.

- **ID e Dokumentit:** *uid* i përdoruesit (i njëjtë me Firebase Auth uid).
- **Fushat kryesore:**
  - fullName (string) – Emri i plotë i përdoruesit.
  - email (string) – Email (duhet të përputhet me Auth.email).
  - phone (string) – Numri i telefonit.
  - address (map) – Objekti adresë: p.sh. { street: "Rr. Dëshmorët", city: "Prishtinë", zip: "10000" }.
  - marketingOptIn (boolean) – Nëse pranon materiale promocionale.
  - membershipActive (boolean) – Nëse ka aktualisht anëtarësim aktiv.
  - paymentInfo (map) – Detajet e pagesës për kompensim: p.sh. { iban: "...", bank: "..." }.
  - notificationToken (string) – FCM device token i fundit (për push njoftime).
  - notificationEnabled (boolean) – Preferencë e përdoruesit për push.
  - createdAt (timestamp) – Data kur u krijua llogaria.
  - updatedAt (timestamp) – Data e fundit e përditësimit të profilit.

**Shembull JSON dokument** users/uid123**:**

json

Copy

{ "fullName": "Arber Hoxha", "email": "arber.hoxha@example.com", "phone": "+355691112233", "address": { "street": "Rruga Dëshmorët e Kombit, Nr.12", "city": "Prishtinë", "zip": "10000" }, "marketingOptIn": true, "membershipActive": true, "paymentInfo": { "iban": "AL35202111090000000001234567", "bank": "BKT" }, "notificationToken": "fcm_token_xxx", "notificationEnabled": true, "createdAt": "2025-04-29T09:30:00Z", "updatedAt": "2025-04-29T10:00:00Z" }

**3.2. Koleksioni** requests **(ose** memberships**)**

**Përdorim:** Ruajtja e kërkesave për anëtarësim dhe statusin e tyre (dhe në rast autorizimi, statusin e çështjes së dëmit).

- **ID e Dokumentit:** Auto-generuar ose mund të përdoret ID e porosisë nga sistemet ekzistuese. Jepet si referencë pas anëtarësimit.
- **Fushat kryesore:**
  - userId (string) – ID (uid) i përdoruesit që bëri kërkesën.
  - requestType (string) – Lloji i kërkesës (p.sh. "membership" për anëtarësim, "claim" për dëmbërkese nëse aplikohet).
  - personalInfo (map) – Të dhënat personale të marra (redundante, pasi janë te users, por mund të ruhen snapshot):
    - name, surname, companyName, address, email, phone, marketingOptIn (vlerat nga formulari).
  - status (string) – Statusi aktual:
    - Për anëtarësim: *“Në shqyrtim”*, *“Aktivizuar”* (kur anëtarësimi është i plotë).
    - Për dëmkërkesë: *“E dërguar”*, *“Në përpunim”*, *“Miratuar”*, *“Refuzuar”*, *“E paguar”*​file-9ubfugm1gyje1rm6sdembd.
  - claimAuthorized (boolean) – Nëse anëtari ka dhënë autorizim për ndërmjetësim të dëmit. Nëse **true**, do të ketë një alije (link) me koleksionin claims ose statusi i dëmit trajtohet brenda këtij dokumenti.
  - paymentStatus (string) – gjendja e pagesës së anëtarësimit: *“pending”*, *“paid”*, *“failed”*. Në fillim, pas inicimit të PaymentIntent mund të jetë “pending”, pas suksesit “paid”.
  - paymentId (string) – ID e PaymentIntent nga Stripe (p.sh. pi_123abc).
  - createdAt (timestamp) – Koha e aplikimit.
  - updatedAt (timestamp) – Koha e fundit e ndryshimit (p.sh. i statusit).

**Shembull JSON dokument** requests/abc123**:**

json

Copy

{ "userId": "uid123", "requestType": "membership", "personalInfo": { "name": "Arber", "surname": "Hoxha", "companyName": null, "address": "Rruga Dëshmorët..., Prishtinë", "email": "arber.hoxha@example.com", "phone": "+355691112233", "marketingOptIn": true }, "claimAuthorized": false, "status": "Në shqyrtim", "paymentStatus": "paid", "paymentId": "pi_1NGhXYZ123", "createdAt": "2025-04-29T10:05:00Z", "updatedAt": "2025-04-29T10:05:00Z" }

_(Nëse përdoruesi ka autorizuar trajtimin e një dëmi, claimAuthorized: true, dhe mund të kemi fusha shtesë si claimStatus, claimId etj. Ose mund të ekzistojë koleksion i veçantë claims. Për thjeshtësi, po supozojmë se qëllimi kryesor i app është anëtarësimi, jo menaxhimi i detajuar i claim-eve.)_

**3.3. Koleksioni** messages

**Përdorim:** Për ruajtjen e mesazheve të chat-it mes përdoruesve dhe stafit mbështetës.

- **Struktura e koleksionit:** Mund të ruhet si koleksion i vetëm:
  - ID e dokumentit: auto (p.sh. msgId).
  - from (string) – uid i dërguesit.
  - to (string) – uid i marrësit (p.sh. admin uid).
  - text (string) – përmbajtja e mesazhit.
  - timestamp (timestamp) – koha e dërgimit.
  - seen (boolean) – nëse marrësi e ka parë (për chat indikator, opsional).

**Ose** struktura me subkoleksione si më lart në seksionin 2.6:

- - Koleksioni threads, nën të subkoleksione messages.

**Shembull JSON dokument i thjeshtë** messages **koleksion:**

json

Copy

{ "from": "uid123", _// user_ "to": "adminUid", _// admin/staff_ "text": "Kam nje pyetje rreth anetaresimit.", "timestamp": "2025-04-29T10:10:00Z", "seen": false }

*(Në këtë model, për të marrë mesazhet e një përdoruesi, do query me dy kushte: where('from','in', \[uidUser, uidAdmin\]) dhe filtrime shtesë. Alternativa me threads/{userId}/messages do të gruponte bisedat për user, prandaj struktura reale mund të jetë:* threads/{uidUser}/messages/{msgId} *për chat-in mes user dhe admin.*)

**3.4. Koleksioni** payments

**Përdorim:** Opsionalisht, ruajtja e transaksioneve të pagesave (p.sh. për auditim ose për funksione shtesë).

- **ID e Dokumentit:** paymentId (p.sh. Stripe PaymentIntent id ose një uid i Firestore).
- **Fushat kryesore:**
  - userId – kush e kreu pagesën.
  - requestId – referenca e anëtarësimit ose kërkesës së lidhur.
  - amount (number) – shuma (në cent, p.sh. 1000 për 10€).
  - currency (string) – monedha (p.sh. "EUR").
  - status (string) – statusi i pagesës (nga Stripe: "succeeded", "requires_action", "canceled", etj.).
  - paymentMethod (string) – lloji i pagesës (p.sh. "card").
  - createdAt (timestamp) – kur u iniciua.
  - confirmedAt (timestamp) – kur u konfirmua.

**Shembull JSON** payments/pi_1NGhXYZ123**:**

json

Copy

{ "userId": "uid123", "requestId": "abc123", "amount": 1000, "currency": "EUR", "status": "succeeded", "paymentMethod": "card", "createdAt": "2025-04-29T10:04:00Z", "confirmedAt": "2025-04-29T10:05:00Z" }

_(Shënim: Shumë zhvillues thjesht i ruajnë të dhënat e pagesës brenda dokumentit të request, por një koleksion i ndarë payments ndihmon për gjurmim dhe pajtueshmëri financiare.)_

**4\. Autentifikimi dhe Shërbimet Cloud**

**Firebase Authentication (Auth):** Për menaxhimin e hyrjes së përdoruesve. Do përdoret **Email & Password** si metoda kryesore. Hapat kryesorë:

- **Regjistrimi i ri:** createUserWithEmailAndPassword(email, password) – krijon userin dhe e kyç. Pas krijimit, dërgohet opsionalisht sendEmailVerification() në background. Një dokument i ri për user-in krijohet në Firestore users (mund ta krijoni me Cloud Function onCreate ose direkt pas suksesit).
- **Hyrja:** signInWithEmailAndPassword(email, password) – kyç userin. Pas hyrjes, merrni uid nga auth().currentUser.uid dhe lexoni dokumentin users/uid për të marrë profilin.
- **Persistimi:** Firebase Auth ruan automatikisht sesionin (përmes AsyncStorage në RN). Në rifillim app-i, mund të përdorni onAuthStateChanged për të dëshmuar login e ruajtur. Mbani gjithashtu token-in (ID token ose custom JWT) nëse komunikoni me server personal (në këtë projekt, kryesisht Firestore direkt).
- **Dalja:** auth().signOut() – del useri.

**Firebase Cloud Messaging (FCM):** Për njoftimet push:

- **Konfigurimi fillestar:** Regjistroni aplikacionin në **Firebase Console** (Android: shtoni google-services.json; iOS: shtoni GoogleService-Info.plist dhe konfiguro APNs). Përdorni bibliotekën @react-native-firebase/messaging për integrim RN.
- **Marrja e lejes:** Në iOS, kërko leje për njoftime messaging().requestPermission(). Në Android, deklaro FirebaseMessagingService (expo ose bare RN e ka).
- **Marrja e tokenit:** Pas instalimit, thirr messaging().getToken() për të marrë FCM token e pajisjes. Ruaje këtë token në Firestore (users.notificationToken) të përdoruesit aktiv.
- **Dërgimi i njoftimeve:** Dy mënyra:
  1.  **Nga serveri (Cloud Function):** P.sh. kur ndryshon statusi i një kërkese, një Cloud Function me trigger onUpdate në requests/{reqId} kontrollon nëse status ndryshoi. Merr userId e atij dokumenti, gjen tokenin e tij nga users/{userId}.notificationToken dhe përdor admin.messaging().sendToDevice(token, payload). *Payload* përmban titullin dhe tekstin e njoftimit (p.sh. “Statusi u përditësua – kërkesa #12345 tani është *Miratuar*.”).
  2.  **Broadcast/Topic:** Të gjithë user-at (ose një grup) mund të abonohen në një *topic* (p.sh. general për njoftime të përgjithshme). Shembull: messaging().subscribeToTopic('general'). Pastaj Cloud Function mund të sendToTopic('general', payload). Në këtë app, nevojat janë kryesisht individuale, ndaj sendToDevice me token individual është zgjidhja.
- **Marrja e njoftimit (Front-end):** Përdorni messaging().onMessage për të kapur njoftimet kur app-i është i hapur. Për njoftime të shtypura (kur app s’është fokusi ose është mbyllur), konfiguro *notification handlers* me react-native-push-notification ose me bibliotekën e RN Firebase Messaging (iOS kërkon edhe regjsitrim APNs).
- **Preferencat e njoftimeve:** Nëse notificationEnabled i user-it është false, ju ose:
  1.  Mos dërgoni njoftim atij user-i (kontrolloni preferencën në Cloud Function).
  2.  Ose çabonoheni nga topic (p.sh. messaging().unsubscribeFromTopic('general')).

**Push Example:** Kur requests/abc123.status kalon nga “Në përpunim” në “Miratuar”, funksioni onUpdate do të dërgojë:

json

Copy

{ "notification": { "title": "Përditësim i Kërkesës", "body": "Kërkesa #abc123 u Miratua!" }, "data": { "requestId": "abc123", "newStatus": "Miratuar" } }

Kjo i shfaqet përdoruesit si njoftim standard. Klikimi i njoftimit mund të trajtohet që ta çojë në ekranin e detajeve të kërkesës përkatëse (përdorni data për të përcjellë info te app).

**Firebase Cloud Functions (Backend):** Përdoren për logjikë që s’bëhet direkt nga front-end (si pagesat, dërgimi i email-eve, triggers e databazës):

- **Pagesat (Stripe Integration):** Krijoni një funksion createPaymentIntent i cili:
  - Pranon amount dhe opsionalisht currency nga aplikacioni.
  - Përdor Stripe SDK (p.sh. stripe = require('stripe')(functions.config().stripe.secret)) me *stripe.secret* të konfiguruar​[firebase.google.com](https://firebase.google.com/docs/tutorials/payments-stripe#:~:text=7,your%20Cloud%20Functions%20environment%20configuration).
  - Krijon PaymentIntent me stripe.paymentIntents.create({ amount, currency, metadata: {userId, requestId} }).
  - Kthen client_secret tek aplikacioni.
  - **Siguri:** Sigurohuni që ky funksion mund të thirret vetëm nga user-i i autentifikuar dhe që amount përcaktohet në backend (mos e besoni plotësisht klientin për shumën). P.sh. për anëtarësim gjithnjë është 10€ – atëherë injoroni amount nga klienti ose e verifikoni me planin e anëtarësimit.
- **Krijimi i anëtarësimit:** Mund të kombinohet me pagesën ose të jetë një hap i ndarë. P.sh. pas konfirmimit të pagesës në front-end, thërrisni një funksion confirmMembership që:
  - Merr userId dhe të dhënat e formularit.
  - Verifikon në Stripe statusin e PaymentIntent nëpërmjet paymentId.
  - Nëse pagesa succeeded, shkruan dokumentin te requests me status “Në shqyrtim” dhe paymentStatus="paid". Mund të dërgojë gjithashtu një email mirëseardhjeje.
  - Kthen mbrapsht membershipId ose mesazh suksesi.
- **Triggers në Firestore:**
  - onCreate në users: kur krijohet një user i ri (p.sh. pas regjistrimit), mund të inicializoni fushat default (p.sh. vendosni membershipActive=false).
  - onUpdate në requests: për dërgimin e FCM push kur ndryshon statusi (siç u përmend).
  - onCreate në messages: dërgoni FCM tek marrësi i mesazhit (p.sh. punonjësi merr njoftim kur user dërgon mesazh, ose anasjelltas).
- **Gjuhë/Platformë:** Firebase Functions mund të shkruhen në **JavaScript ose TypeScript**. Rekomandohet TypeScript për strukturuar kodin, por dhe JS ES6 funksionon sipas praktikave. P.sh.:

typescript

Copy

_// TypeScript Cloud Function example for status change notification_ import \* as functions from 'firebase-functions'; import \* as admin from 'firebase-admin'; admin.initializeApp(); export const notifyStatusChange = functions.firestore .document('requests/{reqId}') .onUpdate(async (change, context) => { const before = change.before.data(); const after = change.after.data(); if (!before || !after) return; if (before.status !== after.status) { const userId = after.userId; const userDoc = await admin.firestore().doc(\`users/${userId}\`).get(); const userData = userDoc.data(); if (!userData || !userData.notificationToken || userData.notificationEnabled === false) return; const payload = { notification: { title: 'Përditësim Statusi', body: \`Kërkesa juaj është tani: ${after.status}\` }, data: { requestId: context.params.reqId, status: after.status } }; await admin.messaging().sendToDevice(userData.notificationToken, payload); } });

_(Shembull: funksioni më lart do të dërgojë njoftim tek pajisja e përdoruesit sa herë që fusha status e requests/{reqId} ndryshon. Kontrollon tokenin FCM dhe preferencën e njoftimeve.)_

**5\. Arkitektura e Kodit (React Native)**

Projekti React Native do të organizohet nëpër foldera për mirëmbajtje të lehtë. Një strukturë e rekomanduar (brenda folderit src/):

- screens/ – Ekranet kryesore të aplikacionit. Secili ekran mund të ketë një file ose një folder nëse komplekso:
  - HomeScreen.js
  - LoginScreen.js & RegisterScreen.js (ose bashkë si AuthScreen.js me tab switching)
  - MembershipForm/ (nënfolder që mban hapat e formularit p.sh. Step1Personal.js, Step2Consent.js, Step3Payment.js, ConfirmationScreen.js)
  - StatusScreen.js (lista e kërkesave)
  - ChatScreen.js
  - ProfileScreen.js
- components/ – Komponentë të ripërdorshëm (UI elements):
  - ButtonPrimary.js, InputField.js, Loader.js, StatusBadge.js (p.sh. komponent që shfaq një status me ngjyrën e duhur).
  - ChatMessageItem.js (për bubble mesazhesh).
  - **Note:** Komponentët i mbani **dumb/presentational** sa të jetë e mundur (marrin props dhe shfaqin UI).
- navigation/ – Konfigurimet e React Navigation:
  - AppNavigator.js – definon stack/tab navigatorët, ekranet dhe rrugët (routes).
  - P.sh. një **Stack Navigator** për Auth (Login/Register), një **Drawer ose Tab Navigator** pas login (Home, Status, Chat, Profile).
- services/ – Logjika e biznesit, sidomos thirrjet API:
  - api.js – funksione për komunikim me backend (p.sh. createPaymentIntent, confirmMembership, ndoshta fetchRequests nëpërmjet Cloud Functions HTTPS).
  - firebase.js – konfigurimi i firebase (initialize app, exports i Auth, Firestore, Messaging).
  - stripe.js – nëse ka ndonjë konfigurime specifike për Stripe SDK (p.sh. inicializimi me publishable key).
- context/ – Implementimi i React Context për state global:
  - AuthContext.js – mban user-in aktual dhe ndonjë info të login (p.sh. isLoading, user object, signIn, signOut funksione).
  - MembershipContext.js (opsionale) – për të mbajtur state-in e formularit të anëtarësimit gjatë hapave.
  - **Provider** komponentët në nivelin më të lartë (p.sh. App.js përfshin <AuthProvider>).
- utils/ ose helpers/ – Funksione utilitare:
  - validation.js (p.sh. funksion për validim email, telefonit).
  - format.js (p.sh. formatime datash).
  - constants.js – Konstante të aplikacionit (p.sh. statuset e mundshme, ngjyrat tema).
- firebase/functions/ – (jo në aplikacion RN, por në repo) – kodet e Cloud Functions.
- assets/ – imazhe, font-e, JSON lokalizimi (nëse s’përdoret i18n tjetër).

**Shënim:** Struktura mund të variojë sipas preferencës së ekipit, por **ndarja e qartë e komponentëve UI nga logjika** (services) është kritike për mirëmbajtje. Gjithashtu, përdorimi i **Context API** ju ndihmon të shmangni “prop drilling” dhe menaxhon state global (p.sh. user-i i kyçur ose të dhënat e mbledhura në formular).

**6\. Praktikat më të Mira të Sigurisë**

Siguria është aspekt kritik pasi ka të bëjë me të dhëna personale dhe pagesa:

- **Komunikim i enkriptuar:** Çdo komunikim me backend-in (Firebase ose serverë tjerë) **duhet të jetë HTTPS**. Firebase e ka vetë SSL, vetëm sigurohuni që për thirrje te serverë custom (nëse ekzistojnë) përdoret https://. Shmangni kërkesat në endpoint-e jo të sigurta.
- **Ruajtja e kredencialeve:** *Mos ruani fjalëkalime në tekst të qartë.* Firebase Auth e menaxhon login; fjalëkalimet nuk dalin nga Firebase. Nëse ruani token-e Auth ose refresh token, përdorni SecureStore ose Keychain/Keystore kur të jetë e mundur, ose të paktën AsyncStorage të kriptuar​file-9ubfugm1gyje1rm6sdembd.
- **Regullat e Firestore:** Implementoni **Security Rules** në Firestore:
  - Koleksioni users: Vetëm përdoruesi vetë mund të lexojë/ndryshojë dokumentin e tij. Shembull rregulli:

groovy

Copy

match /users/{userId} { allow read, write: if request.auth != null && request.auth.uid == userId; }

Kjo parandalon leximin e listës së plotë të user-ave​[stackoverflow.com](https://stackoverflow.com/questions/70418138/can-a-user-read-a-collection-of-users-in-firestore-from-frontend#:~:text=%2F%2F%20Only%20the%20authenticated%20user,author).

- - Koleksioni requests: Lejo leximi vetëm i kërkesave që i përkasin user-it. P.sh. fusha userId te dokumenti:

groovy

Copy

match /requests/{reqId} { allow read: if request.auth != null && request.auth.uid == resource.data.userId; allow write: if request.auth != null && request.auth.uid == resource.data.userId; }

(Shënim: Mund të lejoni vetëm krijim, jo ndryshim nga përdoruesi, nëse dëshironi që vetëm serveri të ndryshojë status.)

- - Koleksioni messages:
    - Opsioni 1: nëse përdorni threads/{uid}/messages, atëherë rregull: lejo lexim/shkrim vetëm kur uid == request.auth.uid (dhe stafi admin do ketë privilegje tjera).
    - Opsioni 2: koleksion global messages: përdorni fushat from dhe to:

groovy

Copy

match /messages/{msgId} { allow read: if request.auth != null && (request.auth.uid == resource.data.from || request.auth.uid == resource.data.to); allow create: if request.auth != null && request.auth.uid == request.resource.data.from && // psh gjithashtu mund te shtoni verifikim qe data.to te jete uid i admin ose vetvetja per chat me veten. allow delete, update: if false; // askush s'duhet ti modifikoj mesazhet pas krijimit, opsionale }

- - - Rekomandohet chat me subkoleksion brenda user documents për thjeshtësi të rregullave.
  - payments: Mund të vendosni vetëm opsion leximi nga admin ose nga vetë user (nëse userId përputhet).
  - **Testoni rregullat** mirë me Firestore Rules Simulator për të siguruar se asnjë të dhënë sensitive nuk ekspozohet.
- **Role-based Access:** Konsideroni ndarje rolesh për *admin* vs *user*. Firebase Auth mund të ketë custom claims (p.sh. admin: true për disa uid). Në app, nëse useri është admin, mund të ketë akses shtesë (p.sh. të shohë të gjitha kërkesat, të përgjigjet në chat). Në Firestore rules, mund të përdorni:

groovy

Copy

allow read: if request.auth.token.admin == true;

për koleksione që admin duhet t’i lexojë (p.sh. të gjitha requests).

- **Mbrojtja e të dhënave lokale:** Nëse ruani data offline (p.sh. backup i profilet në AsyncStorage), mendoni t’i kriptoni. Expo SecureStore ose komuniteti react-native-encrypted-storage janë opcione të mira.
- **Input Validation në Backend:** Edhe pse front-end validon (email format, fushat e detyrueshme), gjithmonë **verifikoni në Cloud Functions**:
  - Email i saktë (ose më mirë merret nga token-i i user-it).
  - userId nga parametri i API përputhet me context.auth.uid (mos lejoni user-in të krijojë gjëra për dikë tjetër).
  - Shuma e pagesës e kalkuluar saktë (mos merret nga klienti).
- **SSL Pinning (Advanced):** Për një shtresë shtesë sigurie, mund të implementoni SSL certificate pinning në aplikacion (p.sh. me bibliotekën react-native-ssl-pinning) për të parandaluar sulmet MITM edhe nëse certifikata root komprometohet. Kjo është opsionale dhe e menaxhueshme në RN me pak punë.
- **Update të rregullt:** Përdorni versionet e fundit të bibliotekave (React Native, Firebase) me patch-et e sigurisë. Shmangni përdorimin e bibliotekave të braktisura (p.sh. tipsi-stripe ka qenë popullor por tani Stripe ka SDK zyrtar).
- **Sensitive Info**: Mos përfshini çelësa sekrete brenda aplikacionit RN (i ekspozuar tek klienti). P.sh. *Stripe Secret Key* vendoseni vetëm në Cloud Functions (siç u tha), jo në app​[firebase.google.com](https://firebase.google.com/docs/tutorials/payments-stripe#:~:text=7,your%20Cloud%20Functions%20environment%20configuration). Në app vendoset vetëm *Publishable Key* i Stripe.
- **Testim penetrimi:** Këshillohet të testoni me mjete debugging (si interceptors proxy) për të siguruar që asgjë sensitive s’po transmetohet plaintext dhe se kërkesat e paautorizuara refuzohen nga Firebase rules.

**7\. Skenarë Testimi për Funksionet Kritike**

Për t’u siguruar që çdo modul funksionon si duhet, planifikoni **skenarë testimi (test cases)**, veçanërisht për rrugët kritike:

- **Regjistrimi dhe Hyrja:**
  1.  *Regjistrim normal:* Përdorues i ri regjistrohet me email unik dhe fjalëkalim valid – pritet të krijohet user, të hyjë automatikisht dhe të krijohet dokument users.
  2.  *Regjistrim dublikatë:* Përdor email ekzistues – pritet error “email adresa është në përdorim” (Firebase kthen auth/email-already-in-use).
  3.  *Hyrje sukses:* Me kredenciale të sakta – pritet navigim në Home (ose ekranin kryesor pas login).
  4.  *Hyrje gabim:* Fjalëkalim i pasaktë – pritet mesazh “Email ose fjalëkalim i pasaktë”.
  5.  *Ruajtja e sesionit:* Pas login, mbyll dhe rihap app – pritet që user të mbetet i kyçur (nëse s’ka bërë sign out).
- **Formulari i Anëtarësimit:**
  1.  *Plotësim i saktë:* Fut të dhëna valide në të gjithë hapat, kryen pagesën me kartë test (Stripe test card 4242 4242 4242 4242, data e vlefshme, CVV), arrin konfirmimin – pritet: pagesa succeeded, dokument requests i krijuar me status “Në shqyrtim”, email konfirmimi dërguar (nëse implementohet funksioni i email-it).
  2.  *Validime lokale:* Lë bosh një fushë të detyrueshme në hapin e parë – pritet mesazh ose highlight i fushës bosh dhe të mos lejojë kalimin në hapin tjetër.
  3.  *Kartë e refuzuar:* Përdor një kartë test që simullon dështim (p.sh. Stripe test card 4000 0000 0000 9995 që jep “declined”) – pritet mesazh gabimi “Pagesa u refuzua, provoni një kartë tjetër”.
  4.  *Mospajtim me kushtet:* Në hapin kushte, nuk check “Jam dakord” – pritet të mos aktivizohet butoni “Vazhdo/Paguaj” ose të japë njoftim “Duhet të pranoni kushtet për të vazhduar”.
- **Statusi i Kërkesave:**
  1.  *Listim korrekt:* Përdoruesi me disa kërkesa të bëra – pritet të shfaqen të gjitha me statuset e fundit (krahasojini me databazën).
  2.  *Nuk ka kërkesa:* Përdorues i ri pa asnjë – pritet ekran bosh me mesazh “Nuk keni ende kërkesa” ose diçka e tillë.
  3.  *Refresh:* Pas ndryshimit të statusit në server (mund ta bëni manualisht nga Firebase Console për testim) -> rrëshqit poshtë listën – pritet rifreskim dhe përditësim i statusit.
  4.  *Njoftim push:* Simulo një ndryshim statusi kur app s’është hapur – pritet që pajisja të marrë njoftimin me tekstin e duhur.
- **Chat:**
  1.  *Dërgim & Marrje mesazhi:* Përdoruesi dërgon mesazh, sistemi (ose një admin testues) i përgjigjet – pritet që mesazhet të shfaqen menjëherë për të dy palët dhe të ruhen në Firestore.
  2.  *Offline message:* Përdoruesi dërgon mesazh ndërsa admin nuk është online – pritet mesazhi të ruhet; kur admin hyn, e sheh mesazhin e papërgjigjur.
  3.  *Rregullat:* Provo të marrësh mesazhe të një user-i tjetër (p.sh. modifiko app që të query mesazhet e threads së tjetrit) – pritet Firestore të refuzojë (verifiko se security rules po punojnë).
- **Profili dhe Cilësimet:**
  1.  *Përditësim profil:* Ndrysho numrin e telefonit dhe ruaj – pritet që users/uid.phone të përditësohet në Firestore dhe UI të reflektojë ndryshimin (ndoshta me konfirmim “Ruajtja u krye me sukses”).
  2.  *Ndryshim fjalëkalimi:* Vendos fjalëkalim të vjetër gabim – pritet mos lejim (nëse kërkohet re-auth, jep mesazh gabimi).
  3.  *Toggle njoftime:* Çaktivizo njoftimet, dërgo një push nga serveri – pritet që pajisja të **mos** marrë njoftim (kontrollo qoftë duke parë logun e funksionit që del "token not found or notifications off").
  4.  *Dil nga llogaria:* Pasi shtyp “Dil”, pritet që app të mos tregojë të dhëna sensitive dhe të ridrejtojë në ekranin e hyrjes. Gjithashtu, pas rilogimit me një user tjetër, të mos shfaqen të dhënat e user-it të mëparshëm (pastrim korrekt i state-it).
- **Siguria & Performanca:**
  1.  *Access i paautorizuar:* Provoni me REST API të lexoni koleksionin users pa token – pritet permission-denied.
  2.  *Thyerje e fluksit:* Mundohuni të nisni pagesë pa u autentifikuar (ose me user guest) – pritet që funksioni createPaymentIntent të refuzojë (nëse e keni kushtëzuar me context.auth).
  3.  *Stres test listat:* Krijoni 50+ kërkesa test për një user – pritet që *Statusi i Kërkesave* (FlatList) të ngarkohet me performancë (duhet të përdorni pagination ose limit për të mos marrë mijëra dokumente njëherësh).
  4.  *Network offline:* Provoni të hapni app-in offline pasi keni bërë login më parë – pritet që të shfaqen të dhënat e fundit (falë cache të Firestore ose AsyncStorage) dhe mesazh “Duke punuar offline” për veprime kritike (ose disablim i butonave që kërkojnë rrjet p.sh. “Antarsohu”).
  5.  *Integrimi i stripe:* Përdorni test mode dhe sigurohuni që pagesat e suksesshme shfaqen në **Stripe Dashboard** nën Logs. Çdo pagesë duhet të lidhet me user-id në metadata – verifikoni që kjo info po i shkon Stripe.

Dokumentoni rezultatin e çdo skenari testimi dhe korigjoni kodin sipas nevojës. Për testim automatik, konsideroni **Jest** (për funksione JS) dhe **Detox** ose **Appium** për testim UI end-to-end në aplikacionin RN.

**8\. Funksionet Backend (Firebase Cloud Functions)**

Lista e funksioneve backend që planifikohen, me detajet e implementimit në **JavaScript/TypeScript**:

- **Function:** createPaymentIntent  
  **Trigger:** HTTPS callable (thirrur nga app kur nis pagesa).  
  **Përshkrim:** Krijon një Payment Intent në Stripe për shumën e anëtarësimit.  
  **Input:** {amount: number, currency: string} – megjithëse amount mund të jetë i njohur (p.sh. 1000 cent).  
  **Veprime:** Verifikon user-in e autentifikuar (context.auth.uid). Përdor stripe.secret key​[firebase.google.com](https://firebase.google.com/docs/tutorials/payments-stripe#:~:text=7,your%20Cloud%20Functions%20environment%20configuration) për të krijuar PaymentIntent me amount dhe currency (p.sh. 1000, "EUR"). Vendos metadata: { uid: uid } për referencë. Kthen { clientSecret: "pi_secret\_..." }.  
  **Kodi (JS):**

js

Copy

const functions = require('firebase-functions'); const admin = require('firebase-admin'); const stripe = require('stripe')(functions.config().stripe.secret); exports.createPaymentIntent = functions.https.onCall(async (data, context) => { if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated'); const uid = context.auth.uid; const amount = 1000; _// predefined fee in cents_ try { const paymentIntent = await stripe.paymentIntents.create({ amount: amount, currency: data.currency || 'EUR', metadata: { userId: uid } }); return { clientSecret: paymentIntent.client_secret }; } catch (e) { console.error('Stripe error', e); throw new functions.https.HttpsError('internal', 'Stripe payment failed'); } });

- **Function:** confirmMembership  
  **Trigger:** HTTPS callable (thirrur pas pagesës së suksesshme).  
  **Përshkrim:** Krijon një regjistrim anëtarësimi në Firestore dhe dërgon email konfirmimi.  
  **Input:** {personalData: {...}, paymentId: "pi_xxx", claimAuthorized: bool} – të dhënat e mbledhura.  
  **Veprime:** Kontrollon context.auth.uid, krijon dokument te requests me fushat përkatëse (userId = uid, personalInfo = data.personalData, status = "Në shqyrtim", paymentStatus = "paid", paymentId = data.paymentId, claimAuthorized = data.claimAuthorized, createdAt = now). Për dërgimin e email, integroni **SendGrid** ose **Email Extension** të Firebase (ose thjesht përdorni **nodemailer** me një SMTP). Mesazhi i email-it: përgëzim për anëtarësimin, ID e kërkesës, info për hapat e ardhshëm.  
  **Output:** { requestId: doc.id } ose detaje të tjera.  
  **Shënim:** Mund të kombinoni këtë funksion me createPaymentIntent (p.sh. pas pagesës suksesshme frontendi thërret një endpoint që bën si verifikimin e PaymentIntent ashtu edhe krijimin e dok.). Por ndarja i lejon front-end të konfirmojë pagesën e pastaj të krijojë dok.
- **Function:** sendSupportMessage (opsional)  
  **Trigger:** HTTPS callable (ose Firestore trigger, por callable mund të bëjë logjikë ekstra).  
  **Përshkrim:** Merr mesazhin e dërguar nga user dhe e ruan në Firestore (nëse duam ta bëjmë përmes funksionit dhe jo direkt nga app).  
  **Input:** { text: "pershendetje" }.  
  **Veprime:** Verifikon user auth, shton dokument te threads/{uid}/messages me from = uid, to = adminUid. Ndoshta dërgon email ose njoftim push tek admin.  
  **Output:** p.sh. { success: true } ose error.  
  _(Në shumicën e rasteve, nuk nevojitet funksion për këtë – app mund të shkruajë direkt te Firestore. Funksioni do duhej nëse do donim, p.sh., filtrimin e fjalëve të këqija, ose logjikë më komplekse.)_
- **Function:** onUserCreated  
  **Trigger:** functions.auth.user().onCreate  
  **Përshkrim:** Kur një user regjistrohet (Auth), krijon dokumentin users/{uid} me fushat bazë (email, createdAt, etj.). Kjo në vend që ta bëjmë nga aplikacioni (reduktim i shanseve që user-i të kyçet por të mos ketë doc profil).  
  **Function:** onRequestStatusChange  
  **Trigger:** Firestore onUpdate (për koleksionin requests siç dhamë shembullin notifyStatusChange më lart).  
  **Veprime:** Nëse status ndryshon, dërgon push njoftim përdoruesit. Nëse statusi bëhet “Aktivizuar” (ose kërkesa e dëmit bëhet “E paguar”), dhe user-i ka paymentInfo të plotësuar, mund të trigger-oni procese të tjera (p.sh. përgatit transfer bankar, por këto ndoshta jashtë scope të aplikacionit mobil).  
  **Function:** onNewMessage  
  **Trigger:** Firestore onCreate (messages/{msgId})  
  **Veprime:** Nëse to është admin, dërgon njoftim/email stafit; nëse to është user, dërgon push user-it (nëse s’është online). Kjo e mban bisedën aktive me njoftime si chat-et e zakonshme.

**Gjuhë e Funksioneve:** Të gjitha këto mund të shkruhen si në JS ashtu edhe në TS. Firebase Functions mbështet TS out-of-the-box (duhet konfigurim minimal). Për shembull, kodi i notifyStatusChange i shkruar më lart ishte TS, i cili kur kompirohet rezulton pothuaj identik në JS.

**Menaxhim i varësive:** Sigurohuni të shtoni varësitë e Stripe (stripe), nodemailer (nëse përdoret), admin SDK (firebase-admin), etj., në package.json brenda folderit functions.

**Vendosja (Deployment):** Pasi funksionet të jenë testuar lokalisht (mund të përdorni firebase functions:shell ose emuluesin), vendosini me firebase deploy --only functions. Kushtojini vëmendje mesazheve të konsolës për të parë nëse environment config (p.sh. stripe.secret) është vendosur saktë me firebase functions:config:set.

**Monitorimi:** Përdorni **Firebase Console > Functions** për të parë log-et e funksioneve gjatë testimit të aplikacionit (kjo ndihmon shumë për të gjetur ndonjë bug si p.sh. mangësi në të dhënat e dërguara). Implementoni *error handling* brenda funksioneve dhe kthejuni klientit mesazhe gabimi domethënëse me HttpsError kur diçka s’shkon.

Ky manual ofron kornizën e plotë teknike për zhvilluesit që do të implementojnë “Interdomestik Asistence”. Duke ndjekur këto udhëzime për ekranet, strukturën e të dhënave, integrimet Firebase/Stripe, arkitekturën e kodit dhe praktikat e sigurimit, ekipi i zhvillimit mund të ndërtojë një aplikacion të qëndrueshëm, të sigurt dhe të lehtë për t’u mirëmbajtur. Dokumenti gjithashtu do të shërbejë si referencë e vazhdueshme gjatë gjithë ciklit të zhvillimit, testimit dhe lançimit të aplikacionit.

Citations

**[Aplikacionit Mobile -ANTARSOHU ne “Interdomestik Asistence”.docx](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=regjistrimi%2Fhyrja:%20nse%20nuk%20sht%20regjistruar,,prdoruesit%20pr%20krkesa%20t%20mtejshme-lulldrnfje/" \t "\_blank)**

[file://file-9UbfUGm1gyJE1rm6SDEMBd](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=regjistrimi%2Fhyrja:%20nse%20nuk%20sht%20regjistruar,,prdoruesit%20pr%20krkesa%20t%20mtejshme-lulldrnfje/" \t "\_blank)

**[Aplikacionit Mobile -ANTARSOHU ne “Interdomestik Asistence”.docx](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=formularit%20me%20hapa%20\(screens\),pr%20kushtet%20e%20shrbimit-54iu/" \t "\_blank)**

[file://file-9UbfUGm1gyJE1rm6SDEMBd](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=formularit%20me%20hapa%20\(screens\),pr%20kushtet%20e%20shrbimit-54iu/" \t "\_blank)

**[Aplikacionit Mobile -ANTARSOHU ne “Interdomestik Asistence”.docx](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=ky%20ekran%20tregon%20pr%20prdoruesin,n-h4gfl/" \t "\_blank)**

[file://file-9UbfUGm1gyJE1rm6SDEMBd](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=ky%20ekran%20tregon%20pr%20prdoruesin,n-h4gfl/" \t "\_blank)

**[Aplikacionit Mobile -ANTARSOHU ne “Interdomestik Asistence”.docx](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=statusi%20i%20antaresimit:%20ky%20module,me%20reponse%20t%20reja%20nga-7uj/" \t "\_blank)**

[file://file-9UbfUGm1gyJE1rm6SDEMBd](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=statusi%20i%20antaresimit:%20ky%20module,me%20reponse%20t%20reja%20nga-7uj/" \t "\_blank)

**[Aplikacionit Mobile -ANTARSOHU ne “Interdomestik Asistence”.docx](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=profili%20i%20prdoruesit:%20prdoruesi%20ka,ndrfaqja%20e%20profilit%20ofron-85joq/" \t "\_blank)**

[file://file-9UbfUGm1gyJE1rm6SDEMBd](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=profili%20i%20prdoruesit:%20prdoruesi%20ka,ndrfaqja%20e%20profilit%20ofron-85joq/" \t "\_blank)

[![Favicon](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAclBMVEVHcEz4vUr0qT/6zVPwmzrohjPngjL3ukvzq0L0sUbphzTpiDT0pz7phzTzpT35ylH6zFL0pz7skjj4vkv6zlTohTP0pj31t0jqijXohTP6zFL6zFL5y1LulznohjTohTP5ylLuljn5ylL0pj75y1LohjQSHjebAAAAI3RSTlMAN81bSXc6DikbtOj3maOXxef4bnaIhf5W+Oe1SmfRxdfP9n2F5csAAAGOSURBVDiNrVLZlqQgDI0KiOJuqW2tfTrJ///iBNDp1q63mTyQAMnNzQLwvyRPsWry7TJ23eXskFZq7HH2ZkZ0u9F4AkAr5wNTgI589IWODgqDKrD/JBsiqDg4fOCOhBsRSt4hwOe1St86JNHhRnmBTUh2SgGoQOkaXVm6odYqz36RRBZxr7J8OW8t9PHju2YeKgPddUNrwHwtzPVeAbMWEoIqBeYBTuXCUa8cUB48xbCvVtTLc2v6NlDQEgm5P0TmhSTa8NP4flELMbgAxTFREd6ew+BEtbGdAJKkYBXMjHo516ryAR3FR8PWl2C8fe3wIRckyXinPo3/pVcTl0YyJLPvpr0HZyUjMeVeqH2yS4V21cT7Rehi6diZv50qNC28DlhPWk8TDo4RJ3voNY1G1z2uzCsPpTYzHmdhKayB36g2zNHue7HJPQ7PYnOhLA7kuA/7dBUu2z6jeocA2RI3+xfCxqGlVmEKbzgA3QTm6vPbCsciT/vjPyQk0sU9nFHEnhzAjtn3mtrk/P0P8gc2wR7HO3HCAAAAAABJRU5ErkJggg==)](https://rnfirebase.io/auth/usage" \l ":~:text=both%20register%20and%20sign%20in,signInWithEmailAndPassword" \t "\_blank)

**[Authentication | React Native Firebase](https://rnfirebase.io/auth/usage" \l ":~:text=both%20register%20and%20sign%20in,signInWithEmailAndPassword" \t "\_blank)**

[https://rnfirebase.io/auth/usage](https://rnfirebase.io/auth/usage" \l ":~:text=both%20register%20and%20sign%20in,signInWithEmailAndPassword" \t "\_blank)

[![Favicon](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC6klEQVRYhdWWS2xMYRTHf+eb0c5URapqPNJ6RNExLBASjyYsJBIRK4+NRUkbC4+FhZ2NBQuJxErisSFErEVYVOIZEaFGIzEtXTSkXqX16HTudyyqVb3303snRZzlefzPL/fcc+6F/9na5zO/bSFns2lKitWIF1v4MkOdB81AKilYYGcxOqaYovYMKQ+uAqkfroZchgN/BeAQGFXOAzXD/aIcbU+zKaqeRC3IpWkUw8mgmEKvgVVzsrT8EYBsmvKkoQ2Y4kxSXto+ltfmeBNGM9IIEoaG3zYHEGaZBJfDbkYkAIGmkKn1ZcKJMQV4sYgFQDpsvgqNbRl2jxlAwbIubO4wO57LsHJMAIywpAiAEoELHYuocCU4L6E2M5UY0wdk6GzfxcwiAABqCsoxoCEoGLiGepvT6K8FhXvkex4T//gUsfnI98N6lqXzWnk0MuAbgd6nGmXHSH98IvGKZZjqLVBWg40IYOKGg4EBn6fAVoJGY1CAWBJJrcdMmBcNQmFzS8C74Adwve3DzooIVNUjiVQkiNLxytrRAVy7nhgxd0EmrwZh4MmEtMVhAKoCS8v9rpJJmGR1JIDUSEcQQLDgBIS4P1YWbTl9I/MDKF2OYqHSL1A6ORKA7wsZ9ASyzvIqZHAbBi2WCD8CUb+2H0C45lQoxVD5a0P1Qh+l/j6P5jAAl1D6nDIzEEp+jiLfHa67KlfqnvFuVABZRRfCKadSDGE2Q4fpa2fI/jGOBAWCv4bjOITy2ilXjqEGtf3Yz7nRuwucqW3hXmgAWcE7YDuQd6pWYvKKZwujvgOPv1j2u4LO/wFZww2UbcC3wIRuvEQp8Wkb0fh450l+0uexIdNKr7OPKzBoepMVGM6hzB1yvsejA4MdqLf96IcH2E+tGLVDmhftN5pqc3z6nX6oFdI7JPHYS549dDKVD8SC8go92Ld3ufW1g8NzslwPox3px0IvEeMV9UA9Sh3CJASL5RXCQ+Cq7ON5FM1/bt8BaAHSNo9ICB4AAAAASUVORK5CYII=)](https://firebase.google.com/docs/tutorials/payments-stripe" \l ":~:text=7,your%20Cloud%20Functions%20environment%20configuration" \t "\_blank)

**[Process payments with Firebase](https://firebase.google.com/docs/tutorials/payments-stripe" \l ":~:text=7,your%20Cloud%20Functions%20environment%20configuration" \t "\_blank)**

[https://firebase.google.com/docs/tutorials/payments-stripe](https://firebase.google.com/docs/tutorials/payments-stripe" \l ":~:text=7,your%20Cloud%20Functions%20environment%20configuration" \t "\_blank)

**[Aplikacionit Mobile -ANTARSOHU ne “Interdomestik Asistence”.docx](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=storage%20lokal:%20pr%20ruajtjen%20e,pr%20siguri%20m%20t%20lart-r7isoeh/" \t "\_blank)**

[file://file-9UbfUGm1gyJE1rm6SDEMBd](file:///xn--file-9ubfugm1gyje1rm6sdembd%23:~:text=storage%20lokal:%20pr%20ruajtjen%20e,pr%20siguri%20m%20t%20lart-r7isoeh/" \t "\_blank)

[![Favicon](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC+klEQVRYhe2WS2hTaRTHf+emVk1iU4ui4jDqnesDEbRWwS7c6CxkZiMoikKhDELdiI+FD5jBU1CoK8UH6kZhXAwjiMKgjAMzMLsRsT4oRdMkVhErItU2ualokuOiCZaxNklNVdD/7pzvfH9+3/kO373wVV+6pJJmvrrLcjjHwbZM0njHRwXobXMj1S+dbqDWIJYhs3yydr8ots+pFEDd3kSfiWwBTMAbR9Vvdp7AmALYeQJJ9RYW4kn7uy4YdiAfrvE7vYNjCpDq9I4JtPutc1sKuTBxBbucD3cn1dswkseoZ2DgwJxZ2UzgP2B6PnUuhL9VtCfd2+ZGqgfkGiLzgTRkG8N6/85wPqPuwMSf7z+ATD3wbz7V5BO61q/uvLq9ib6cBNYCfUDQCFzq13lTKgoAENbuJyG++R44BBiwyMG5nlRvfY1G74rQxOBQznHIDjuUZV9BSuduFugP0nVFlFwh7+t3aw05C9TmYY6EZkT2pB/37TOhNV92OKyxXUP9yupAb5sbATtu2B8pvGhqv7djMAchjV/KYsuBW/mD7fR7+v8ROGPIRYOUYHf/71lWB5LqLRTsFMjKQs4g6cCvWXJHazQRNZ09wSdwEqQ5X/IUoylTRbz2l1j8gwAK8tVbatg2kE3A+LcsXEXsaMjiV9N4zQYngGeO0RhsjT0azuuDnuLkQW+q89paDNkKzByyFDWzY+YEbotln4/0XSgZwFf3BxNnsom0hxd0RWUD2cKanW4Yl+p5sQ5ku8CKIdv2hTXWNpJvyQAp9f4GVgEY+MBtB24C7TjcDE6LdEjLjde+ussMZzvY6oGJVfOn7rmXrBTAn0AjUPOekldAh8EN4FYO+yui8Vgx37JmwBQnieuJSL0YS0HqwRpA6t41zv0Y0sSVUQOcOfe7AfzUtLEoZFrdbzMiDWKyRAaBFmepXhzRzt5iPlXFzEtRUBMPgYfAxXL3lgyQUs/KMQ5rrKTrrdgf0WhVcgdKPVG5+vw7UJjisdIn78BXfXK9AUEcGEtNVbieAAAAAElFTkSuQmCC)](https://stackoverflow.com/questions/70418138/can-a-user-read-a-collection-of-users-in-firestore-from-frontend" \l ":~:text=%2F%2F%20Only%20the%20authenticated%20user,author" \t "\_blank)

**[firebase - Can a user read a collection of users in firestore from frontend? - Stack Overflow](https://stackoverflow.com/questions/70418138/can-a-user-read-a-collection-of-users-in-firestore-from-frontend" \l ":~:text=%2F%2F%20Only%20the%20authenticated%20user,author" \t "\_blank)**

[https://stackoverflow.com/questions/70418138/can-a-user-read-a-collection-of-users-in-firestore-from-frontend](https://stackoverflow.com/questions/70418138/can-a-user-read-a-collection-of-users-in-firestore-from-frontend" \l ":~:text=%2F%2F%20Only%20the%20authenticated%20user,author" \t "\_blank)

All Sources

[Aplikaci...nce”.docx](https://chatgpt.com/c/Aplikacionit%20Mobile%20-ANTARSOHU%20ne%20%20%E2%80%9CInterdomestik%20Asistence%E2%80%9D.docx" \t "\_blank)

[![Favicon](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAclBMVEVHcEz4vUr0qT/6zVPwmzrohjPngjL3ukvzq0L0sUbphzTpiDT0pz7phzTzpT35ylH6zFL0pz7skjj4vkv6zlTohTP0pj31t0jqijXohTP6zFL6zFL5y1LulznohjTohTP5ylLuljn5ylL0pj75y1LohjQSHjebAAAAI3RSTlMAN81bSXc6DikbtOj3maOXxef4bnaIhf5W+Oe1SmfRxdfP9n2F5csAAAGOSURBVDiNrVLZlqQgDI0KiOJuqW2tfTrJ///iBNDp1q63mTyQAMnNzQLwvyRPsWry7TJ23eXskFZq7HH2ZkZ0u9F4AkAr5wNTgI589IWODgqDKrD/JBsiqDg4fOCOhBsRSt4hwOe1St86JNHhRnmBTUh2SgGoQOkaXVm6odYqz36RRBZxr7J8OW8t9PHju2YeKgPddUNrwHwtzPVeAbMWEoIqBeYBTuXCUa8cUB48xbCvVtTLc2v6NlDQEgm5P0TmhSTa8NP4flELMbgAxTFREd6ew+BEtbGdAJKkYBXMjHo516ryAR3FR8PWl2C8fe3wIRckyXinPo3/pVcTl0YyJLPvpr0HZyUjMeVeqH2yS4V21cT7Rehi6diZv50qNC28DlhPWk8TDo4RJ3voNY1G1z2uzCsPpTYzHmdhKayB36g2zNHue7HJPQ7PYnOhLA7kuA/7dBUu2z6jeocA2RI3+xfCxqGlVmEKbzgA3QTm6vPbCsciT/vjPyQk0sU9nFHEnhzAjtn3mtrk/P0P8gc2wR7HO3HCAAAAAABJRU5ErkJggg==)rnfirebase](https://rnfirebase.io/auth/usage" \l ":~:text=both%20register%20and%20sign%20in,signInWithEmailAndPassword" \t "\_blank)

[![Favicon](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC6klEQVRYhdWWS2xMYRTHf+eb0c5URapqPNJ6RNExLBASjyYsJBIRK4+NRUkbC4+FhZ2NBQuJxErisSFErEVYVOIZEaFGIzEtXTSkXqX16HTudyyqVb3303snRZzlefzPL/fcc+6F/9na5zO/bSFns2lKitWIF1v4MkOdB81AKilYYGcxOqaYovYMKQ+uAqkfroZchgN/BeAQGFXOAzXD/aIcbU+zKaqeRC3IpWkUw8mgmEKvgVVzsrT8EYBsmvKkoQ2Y4kxSXto+ltfmeBNGM9IIEoaG3zYHEGaZBJfDbkYkAIGmkKn1ZcKJMQV4sYgFQDpsvgqNbRl2jxlAwbIubO4wO57LsHJMAIywpAiAEoELHYuocCU4L6E2M5UY0wdk6GzfxcwiAABqCsoxoCEoGLiGepvT6K8FhXvkex4T//gUsfnI98N6lqXzWnk0MuAbgd6nGmXHSH98IvGKZZjqLVBWg40IYOKGg4EBn6fAVoJGY1CAWBJJrcdMmBcNQmFzS8C74Adwve3DzooIVNUjiVQkiNLxytrRAVy7nhgxd0EmrwZh4MmEtMVhAKoCS8v9rpJJmGR1JIDUSEcQQLDgBIS4P1YWbTl9I/MDKF2OYqHSL1A6ORKA7wsZ9ASyzvIqZHAbBi2WCD8CUb+2H0C45lQoxVD5a0P1Qh+l/j6P5jAAl1D6nDIzEEp+jiLfHa67KlfqnvFuVABZRRfCKadSDGE2Q4fpa2fI/jGOBAWCv4bjOITy2ilXjqEGtf3Yz7nRuwucqW3hXmgAWcE7YDuQd6pWYvKKZwujvgOPv1j2u4LO/wFZww2UbcC3wIRuvEQp8Wkb0fh450l+0uexIdNKr7OPKzBoepMVGM6hzB1yvsejA4MdqLf96IcH2E+tGLVDmhftN5pqc3z6nX6oFdI7JPHYS549dDKVD8SC8go92Ld3ufW1g8NzslwPox3px0IvEeMV9UA9Sh3CJASL5RXCQ+Cq7ON5FM1/bt8BaAHSNo9ICB4AAAAASUVORK5CYII=)firebase.google](https://firebase.google.com/docs/tutorials/payments-stripe" \l ":~:text=7,your%20Cloud%20Functions%20environment%20configuration" \t "\_blank)

[![Favicon](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC+klEQVRYhe2WS2hTaRTHf+emVk1iU4ui4jDqnesDEbRWwS7c6CxkZiMoikKhDELdiI+FD5jBU1CoK8UH6kZhXAwjiMKgjAMzMLsRsT4oRdMkVhErItU2ualokuOiCZaxNklNVdD/7pzvfH9+3/kO373wVV+6pJJmvrrLcjjHwbZM0njHRwXobXMj1S+dbqDWIJYhs3yydr8ots+pFEDd3kSfiWwBTMAbR9Vvdp7AmALYeQJJ9RYW4kn7uy4YdiAfrvE7vYNjCpDq9I4JtPutc1sKuTBxBbucD3cn1dswkseoZ2DgwJxZ2UzgP2B6PnUuhL9VtCfd2+ZGqgfkGiLzgTRkG8N6/85wPqPuwMSf7z+ATD3wbz7V5BO61q/uvLq9ib6cBNYCfUDQCFzq13lTKgoAENbuJyG++R44BBiwyMG5nlRvfY1G74rQxOBQznHIDjuUZV9BSuduFugP0nVFlFwh7+t3aw05C9TmYY6EZkT2pB/37TOhNV92OKyxXUP9yupAb5sbATtu2B8pvGhqv7djMAchjV/KYsuBW/mD7fR7+v8ROGPIRYOUYHf/71lWB5LqLRTsFMjKQs4g6cCvWXJHazQRNZ09wSdwEqQ5X/IUoylTRbz2l1j8gwAK8tVbatg2kE3A+LcsXEXsaMjiV9N4zQYngGeO0RhsjT0azuuDnuLkQW+q89paDNkKzByyFDWzY+YEbotln4/0XSgZwFf3BxNnsom0hxd0RWUD2cKanW4Yl+p5sQ5ku8CKIdv2hTXWNpJvyQAp9f4GVgEY+MBtB24C7TjcDE6LdEjLjde+ussMZzvY6oGJVfOn7rmXrBTAn0AjUPOekldAh8EN4FYO+yui8Vgx37JmwBQnieuJSL0YS0HqwRpA6t41zv0Y0sSVUQOcOfe7AfzUtLEoZFrdbzMiDWKyRAaBFmepXhzRzt5iPlXFzEtRUBMPgYfAxXL3lgyQUs/KMQ5rrKTrrdgf0WhVcgdKPVG5+vw7UJjisdIn78BXfXK9AUEcGEtNVbieAAAAAElFTkSuQmCC)stackoverflow](https://stackoverflow.com/questions/70418138/can-a-user-read-a-collection-of-users-in-firestore-from-frontend" \l ":~:text=%2F%2F%20Only%20the%20authenticated%20user,author" \t "\_blank)
