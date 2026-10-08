# Metode: hvor tallene kommer fra og hvordan de regnes ut

Dette dokumentet beskriver hvert tall siden viser: hva som hentes ferdig fra en kilde, hva som regnes ut i nettleseren, og
hvor sikkert resultatet er. Det følger koden slik den var i utgaven fra 7. oktober 2026. Funksjonsnavnene i parentes viser hvor
i koden metoden ligger.

Siden er en prototype. Tall fra SSB er offisiell statistikk. Alt som er regnet ut i nettleseren, er anslag til illustrasjon.

## Kort oversikt

| Tall på siden | Hentet eller regnet | Kilde |
|---|---|---|
| Bebygd, jordbruk, natur og landareal | Hentet, summert i tre klasser | SSB tabell 09594 |
| Innsjø og elv | Hentet | SSB tabell 09594 |
| Hav | Regnet: kommunens flate minus land og ferskvann | Kartverket og SSB |
| Anslått utvikling fra 2017 | Hentet, satt sammen med plantallene | SSB og egen utregning |
| Planlagt utbygging på natur og jordbruk | Regnet i et rutenett på 21 meter | DiBK og NIBIO |
| Verneområder og villreinområder | Flatene hentet, arealet regnet | Miljødirektoratet |
| Verdsatt natur og kartleggingsgrad | Flatene hentet, arealet regnet | Miljødirektoratet |
| Inngrepsfri natur | Regnet fra ett bilde av kommunen | Miljødirektoratet |
| Grått areal og grønt i bebygd område | Regnet fra to bilder av kommunen | NIBIO |
| Egne områder og opplastet plan | Regnet i samme rutenett som planen | Brukeren |

## Felles for alle utregninger

**Koordinatsystem.** Alt regnes i UTM sone 33 (EPSG:25833), som dataene er laget i.

**Areal i kartet og i terrenget.** I UTM er flater litt større i kartet enn i terrenget, og mer jo lenger øst eller vest for
sonens midtlinje. Hvert areal deles derfor på k², der k = 0,9996 · (1 + (x − 500 000)² / (2 · 6 380 000²)) og x er
øst-koordinaten midt i kommunen (`utm33`). For Trondheim utgjør rettelsen under 0,1 %.

**Rutenettet.** Planlagt utbygging og alt som krysses med den, regnes i et rutenett med ruter på 21,16 meter. Det er
Kartverkets flisnett for UTM33 på nivå 9, med 512 ruter per flis. Én rute er 0,448 dekar.

**Halvregelen.** Når en flate legges i et rutenett, teller en rute med hvis flaten dekker minst halve ruta. Det samme gjelder
bildene fra tjenestene, der en piksel teller hvis den er minst halvveis dekket.

**Enhet og avrunding.** Internt regnes det i km². Siden viser dekar (1 km² = 1000 dekar): hele dekar fra 100 og oppover, én
desimal under 100, og «under 0,1» for det minste (`dekar`). Tall som er regnet ut i nettleseren, står med «ca.» i setninger.

**Ingenting lagres.** Svar fra kildene huskes så lenge siden er åpen, og hentes på nytt neste gang. Tallene kan derfor endre
seg fra dag til dag når kildene oppdateres.

## Bebygd, jordbruk, natur og landareal

- **Kilde:** SSB tabell 09594, «Arealbruk og arealressurser», nyeste år.
- **Hentes:** arealet i km² per arealklasse for kommunen. SSBs nye API (PxWebApi v2) brukes først, og det eldre (v0) hvis det
  nye ikke svarer. De to gir samme tall (`hentSSB`).
- **Regnes:** klassene summeres til tre (`tolkAreal`):
  - Bebygd: 01 til 14. Det er blant annet bolig, fritidsbebyggelse, næring og tjenesteyting, transport og teknisk
    infrastruktur, grønne områder og idrettsområder, og uklassifisert bebyggelse og anlegg.
  - Jordbruk: 15–16.
  - Natur: 17 skog, 18 åpen fastmark, 19 åpen myr, 20 bart fjell, 21 snø og is, og 24 uklassifisert ubebygd område.
  - Landareal er summen av de tre. Prosentene på siden er andel av landarealet.
- **Forbehold:** «Grønne områder, idretts- og sportsområder» (12–13) er bebygd i denne inndelingen. Tallene er SSBs, og
  nøyaktigheten er SSBs.

## Land og vann

- **Kilde:** SSB tabell 09594 for innsjø (22.01) og elv (22.02). Kartverkets kommunegrense for kommunens samlede flate.
- **Regnes:** hav = kommunens flate − landareal − innsjø − elv (`tolkVann`). Flaten er arealet av grensepolygonet fra
  Kartverket, rettet for målestokken i UTM. SSB har klassen 23 «Sjøområde», men den er tom per kommune, så hav må regnes ut.
- **Forbehold:** Er resten mindre enn 0,5 km² eller 0,5 % av flaten, regnes det som avvik mellom grense og statistikk, og
  kommunen vises uten hav.

## Anslått utvikling

- **Kilde:** SSB tabell 09594 med SSBs sammenslåtte tidsserier (kodelisten `agg_KommSummer`), så tallene for 2017 gjelder
  dagens kommune også der kommuner er slått sammen.
- **Regnes:** tre kolonner (`tolkHistorie`, `etterPlan`): 2017, nyeste år, og nyeste år der planlagt utbygging på natur og
  jordbruk er trukket fra de to klassene og lagt til bebygd.
- **Forbehold:**
  - SSB skriver at tabellen ikke kan brukes til å beregne arealendringer mellom årganger, fordi datagrunnlaget blir mer
    fullstendig over tid. Kolonnen for 2017 er derfor et anslag, og noe av forskjellen kan skyldes bedre kartlegging.
  - Avviker kommunens samlede flate med mer enn 0,5 % mellom 2017 og nyeste år, er grensen trolig flyttet, og siden viser ingen
    sammenligning.
  - Har SSB ikke tall for kommunen i 2017, vises ikke tabellen. Det gjelder blant annet kommuner som ble opprettet ved deling.
  - Siste kolonne blander offisiell statistikk med et anslag fra nettleseren.

## Dagens arealklasser i kartet

Kartet er ikke et tall i seg selv, men alle kryssinger bygger på det.

- **Kilde:** NIBIO, Nasjonalt grunnkart for arealanalyse, årsversjon 2025, som WMS.
- **Hentes:** kartfliser der siden ber NIBIO tegne seks klasser i rene farger, ut fra egenskapen `okosystemtypeniva1`:
  bebygd (bebygd og opparbeidet areal), jordbruk (dyrket mark og grasmark), natur (skog, hei og buskmark, lite vegetert mark,
  våtmark og strender), hav, innsjø og elv.
- **Regnes:** hver piksel tolkes som den klassen det er mest av (`klasseAv`). I kanten mellom to flater blander tjenesten
  fargene, og fargen leses som en blanding av de to nærmeste klassene.
- **Zoomet ut:** NIBIO tegner grunnkartet først fra 1:50 000. For kommunene i Trøndelag og Bergen ligger et ferdig bilde av
  hele kommunen lagret sammen med siden, laget av samme tjeneste (`verktoy/oversiktsbilde.py`). For andre kommuner setter
  nettleseren sammen et bilde av flisene den har hentet.
- **Forbehold:** Inndelingen i kartet og i SSBs tall er ikke den samme. Kartet følger grunnkartets økosystemtyper, tallene
  følger SSBs arealklasser. De lagrede bildene har høyst 2048 piksler på lengste side. Det gir fra 11 til rundt 45 meter per
  piksel, og opptil 65 meter i kystkommuner med mye sjø innenfor grensen. Kryssingen blir tilsvarende grovere der.

## Planlagt utbygging

- **Kilde:** DiBKs nasjonale tjeneste for kommuneplaner (WMS), laget `kparealformalomrade`.
- **Hentes:** flatene med arealformål i 1000- og 2000-serien (bebyggelse og anlegg, samferdselsanlegg og teknisk
  infrastruktur) og arealbruksstatus 2 (framtidig). Siden ber om flatene fylt uten kantstrek.
- **Regnes** (`tellBlokk`, `byggPlanRaster`, `ryddStriper`):
  1. Planflatene og dagens klasser legges i rutenettet på 21 meter for hele kommunen.
  2. En rute er planlagt utbygging hvis planflaten dekker minst halve ruta.
  3. Ruter som i dag er natur eller jordbruk, telles. Ruter som alt er bebygd eller vann, telles ikke.
  4. Smale striper tas ut: et felt beholdes bare hvis det har en kjerne, altså minst én rute med planlagt utbygging på alle
     fire sider. Alt som henger sammen med en kjerne, beholdes. Felt som ikke er bredere enn rundt 40 meter noe sted, faller
     bort. De oppstår mest der plangrensen og grunnkartet ikke er tegnet helt likt.
  5. Prosenten er andel av rutene som i dag er natur, eller jordbruk, i det samme rutenettet.
- **Hele kommunen eller en del:** Med lagret oversiktsbilde regnes hele kommunen ut når den velges. Uten regnes bare den delen
  nettleseren har hentet kart for, og siden sier det.
- **Finnes det en plan?** Ett lite bilde av kommunen viser hvor stor del av flaten planlaget dekker. Under 15 % regnes som at
  DiBK ikke har kommuneplanen. Navnet på planen hentes med ett oppslag i et punkt (`sjekkPlan`).
- **Forbehold:**
  - Kommuneplanens arealdel viser hva som er satt av, ikke hva som blir bygd, og ikke reguleringsplaner.
  - Ikke alle kommuner har planen sin hos DiBK. Oslo mangler.
  - Tallet for natur og jordbruk er uten smale striper. Tallet med smale striper står i parentes.
- **Kontroll:** DiBKs standardstil tegner en strek rundt hver flate. Med ruter på 21 meter doblet den omtrent tallet for natur i
  Trondheim, og siden bruker derfor egen stil uten strek. Etter rettelsen ga opplasting av de samme flatene som vektor 1,5 %
  avvik fra tallet regnet fra tjenestens bilder.

### Kontroll mot vektoranalyse

7. oktober 2026 ble tallene sammenlignet med en vektoranalyse fra Miljødirektoratet: kartet «NGA_KPA_endringer», der
kommuneplanens arealdel er lagt geometrisk oppå grunnkartet for 20 kommuner i Trøndelag. Fra den ble arealet av framtidig
bebyggelse, anlegg og samferdsel per økosystemtype regnet ut og satt opp mot sidens tall. Selbu er holdt utenfor, fordi de to
kildene har ulike planer der. Resten har samme plan-id i begge.

| For 19 kommuner samlet | Vektor | Siden | Avvik |
|---|---|---|---|
| Planlagt utbygging på land i alt | 49 658 daa | 49 247 daa | −0,8 % |
| På natur, med smale striper | 41 199 daa | 42 302 daa | +2,7 % |
| På natur, uten smale striper (tallet siden viser) | 41 199 daa | 41 206 daa | 0,0 % |
| På jordbruk, uten smale striper | 2 562 daa | 2 388 daa | −6,8 % |
| På areal som alt er bebygd | 5 897 daa | 4 243 daa | −28 % |

- For natur ligger tallet siden viser, innenfor 5 % av vektoranalysen i 14 av 17 kommuner med over 100 dekar. Medianen er 2,6 %.
- Rutenettet overser bebygde flater som er smalere enn en rute, særlig veier. De blir regnet som natur eller jordbruk i tallet
  med smale striper. I Oppdal ligger 1 020 dekar framtidig vegformål på veier som finnes, og tallet med smale striper ble
  674 dekar natur mot 195 i vektoranalysen. Regelen om smale striper tar bort det meste av dette, og tallet siden viser, ble 156.
- Regelen om smale striper tar også bort noe som er reelt: smale felt og nye veier. I Heim, der 324 dekar natur ligger i
  samferdselsformål, viser siden 11 % for lite. For jordbruk er tallet samlet 7 % for lavt.
- Å telle andeler av hver klasse per rute i stedet for flertallsklassen ble prøvd. Det tok det samlede avviket med smale
  striper fra +1,5 % til +0,1 % når Oppdal holdes utenfor, men hjalp ikke på veiene.

**Finere ruter.** Rutene på 21 meter kommer av at planen hentes som fliser på nivå 9 med 512 piksler. Samme metode ble prøvd
på finere nivå, med grunnkartet hentet som fliser fra NIBIO og bare der det ligger planlagt utbygging. Tallene er planlagt
utbygging på natur med smale striper, i dekar:

| Kommune | Vektor | 21 m | 10,6 m | 5,3 m | 2,6 m |
|---|---|---|---|---|---|
| Skaun | 3 335 | 3 340 | 3 353 | 3 330 | |
| Meråker | 2 749 | 2 850 | 2 782 | 2 753 | |
| Ørland | 9 750 | 10 012 | 9 822 | 9 756 | |
| Heim | 1 506 | 1 610 | 1 557 | 1 521 | |
| Oppdal | 195 | 674 | 485 | 304 | 227 |

Avviket halveres omtrent for hvert nivå. På 5,3 meter er det 1 % eller mindre i fire av fem kommuner. Veiene i Oppdal krever
2,6 meter for å komme under 20 %. Fordi bare fliser med planlagt utbygging hentes, dobles antall fliser omtrent per nivå i
stedet for å firedobles. For Oppdal ble det 38, 75 og 130 kartfliser fra NIBIO på de tre nivåene, og for Heim 119 og 229.

Forbehold ved kontrollen: vektoranalysen er et arbeidskart uten beskrivelse, og det er ikke kjent hvilken versjon av grunnkartet
den bygger på. Planene i den er kopiert fra DiBK 11. januar 2026 for de fleste kommunene, mot 2. februar 2026 i tjenesten
siden bruker.

## Verneområder og villreinområder

- **Kilde:** Miljødirektoratets karttjenester: naturvernområder (`vern`) og leveområder for villrein (`villrein`).
- **Hentes:** flatene der kommunenummeret står i egenskapen for kommune, forenklet med 5 meter for vern og 20 meter for
  villrein, med navn, verneform, vernedato og lenke til faktaark.
- **Regnes:**
  - Hver flate klippes mot kommunegrensen, og arealet av det som ligger i kommunen, regnes ut og rettes for målestokken
    (`klippNatur`). Summen er summen av flatene.
  - Planlagt utbygging innenfor: midtpunktet i hver rute med planlagt utbygging slås opp i flatene (`kryssNatur`). En rute
    telles én gang per tema. Ruter i smale striper oppgis for seg.
- **Forbehold:**
  - Verneområder kan ligge i sjø og innsjøer, men prosenten regnes av landarealet. I kystkommuner kan den derfor bli over
    100 %, for eksempel på Frøya.
  - Overlapper to flater, telles overlappet to ganger i summen.

## Verdsatt natur

- **Kilde:** Miljødirektoratet, naturtyper med KU-verdi (`naturtyper_kuverdi`), de fire verdikategoriene svært stor, stor,
  middels og noe verdi.
- **Regnes:**
  - Arealet per verdikategori finnes ved å tegne flatene i et rutenett over kommunen, med ruter på minst 10 meter og høyst 1536
    ruter på lengste side, og summere dekningen (`klasseAreal`). Der lokaliteter overlapper, teller den høyeste verdien, slik
    kartet også viser det. Det er derfor ingen dobbeltelling.
  - Planlagt utbygging innenfor regnes som for verneområder, og en rute der lokaliteter overlapper, regnes til den høyeste
    verdien.
- **Forbehold:** Tjenesten gir et begrenset antall flater per svar. Får siden ikke alle, sier den at tallet er for lavt.
- **Kontroll:** Rutenettmetoden ga under 0,2 % avvik fra geometrisk sammenslåing av flatene i Trondheim.

### Kartleggingsgrad og helhetsbildet

- **Kilde:** Miljødirektoratets dekningskart for naturtypekartlegging etter Miljødirektoratets instruks (`naturtyper_nin`).
- **Regnes** (`hentDekning`, `byggNaturTall`):
  - Kartlagt areal er dekningsflatene slått sammen og klippet mot kommunen. Kartleggingsgraden er dette delt på landarealet
    fra SSB, og vises som høyst 100 %.
  - Verdsatt natur deles i det som ligger innenfor og utenfor det kartlagte, med samme rutenettmetode.
  - Planlagt utbygging på natur deles i ruter innenfor og utenfor det kartlagte.
- **Forbehold:** Det kartlagte er ikke et tilfeldig utvalg av kommunen, så andelen verdsatt natur der kan ikke overføres til
  resten. Utenfor det kartlagte betyr «ingen registrert» at det ikke er lett, ikke at naturen mangler verdi. Dekningsflatene
  kan ligge delvis i vann, mens graden regnes av landarealet.

## Inngrepsfri natur

- **Kilde:** Miljødirektoratet, inngrepsfrie naturområder, laget `status` (nyeste status, 2023), som WMS.
- **Hentes:** ett bilde av hele kommunen, med ruter på minst 20 meter og høyst 2048 ruter på lengste side.
- **Regnes** (`tolkInon`): hver rute får sonen fargen ligger nærmest: sone 2 (1–3 km fra tyngre tekniske inngrep), sone 1
  (3–5 km) eller villmarkspreget (5 km eller mer). Rutene innenfor kommunegrensen telles og regnes om til areal, avrundet til
  nærmeste 10 dekar.
- **Forbehold:**
  - Arealet gjelder alt innenfor sonene, også innsjøer, mens prosenten regnes av landarealet.
  - Tallet krysses ikke med planlagt utbygging. Sonene følger avstanden til nærmeste inngrep, så et nytt inngrep flytter
    sonegrensene flere kilometer unna.
  - I kartet får bare klassen natur sonefarge.

## Grått areal

- **Kilde:** Kart over grå arealer (Miljødirektoratet, Kartverket, NIBIO og SSB), testversjon 1 fra 2025, som WMS hos NIBIO.
- **Hentes:** to bilder av hele kommunen i samme rutenett som for inngrepsfri natur: alt grått areal, og flatene med oppgitt
  andel vegetasjon. Siden ber om flatene fylt uten kantstrek.
- **Regnes** (`tolkGraa`, `kryssGraa`):
  - Hver rute får et trinn etter andel vegetasjon i flaten: under 1 %, 1–25 %, 25–50 %, 50–75 % eller 75–100 %. Grått areal
    uten oppgitt andel, som veier, er et eget trinn. Rutene innenfor kommunen telles per trinn.
  - Planlagt utbygging på grått areal: her telles alle ruter med planlagt utbygging på land, også der det alt er bebygd og i
    smale striper. «Minst halvparten vegetasjon» er trinnene fra 50 % og opp.
  - Grønt i bebygd område er ruter som er bebygd i grunnkartet, men ikke grå.
- **Forbehold:**
  - Kartet er en testversjon. Andel bygninger er ikke brukt, fordi tjenesten oppga 0 for alle flater som ble slått opp.
  - Grått betyr ikke ledig. Kartet skiller ikke et boligområde i bruk fra en nedlagt industritomt.
  - Arealet per trinn er omtrentlig, siden rutene er på 20 meter eller mer.
- **Kontroll:** De to bildene hentes hver for seg. Hentet i ett bilde blandes fargene langs kantene, og det ga 11 % for mye grått
  areal i Trondheim. I en gjennomgang av Trondheim på 10 meters ruter var 98,9 % av det som er bebygd, men ikke grått, det
  grunnkartet kaller grønne arealer.

## Egne områder og opplastet plan

- **Kilde:** flater brukeren tegner i kartet, eller en GeoJSON-fil i samme format som DiBKs nedlasting av plandata.
- **Regnes** (`lesPlanfil`, `leggInnEget`, `byggPlanRaster`, `byggEgneRader`):
  - Flatene legges i rutenettet på 21 meter etter halvregelen. Innenfor flatene erstatter de kommuneplanen.
  - Et område satt til utbygging tar all natur og alt jordbruk i området. Et område satt til ikke utbygging fjerner det planen
    setter av der.
  - I en opplastet fil regnes flater med arealformål i 1000- og 2000-serien og status framtidig, eller uten status, som
    utbygging. Andre flater med arealformål regnes som ikke utbygging. Har filen ingen arealformål, regnes alle flater som
    utbygging.
  - Projeksjonen leses fra filen. Mangler den, gjettes grader eller den UTM-sonen som legger planen nærmest kommunen.
  - Tabellene viser kommuneplanen alene, tallet med egne områder, og forskjellen.
- **Forbehold:** Tegnede områder under 400 m² avvises. Områder smalere enn rundt 40 meter faller for regelen om smale striper
  og gir ikke utslag. Ingenting lagres eller sendes fra nettleseren.

## Trykk i kartet

Siden leser fargen i punktet og oppgir klassen fargen ligger nærmest (`kart.js`). Er et naturtema slått på, slås punktet også
opp i flatene. Utenfor valgt kommune slås kommunen opp hos Kartverket.

## Kjente svakheter samlet

- Kartet og tallene bygger på to ulike inndelinger: grunnkartets økosystemtyper og SSBs arealklasser.
- Alt som krysses med planlagt utbygging, har en oppløsning på 21 meter, og grovere der oversiktsbildet er grovere.
- Prosent av landarealet er misvisende for tema som også ligger i vann: verneområder, inngrepsfri natur og kartleggingsgrad.
- Tallene kommer fra tjenester som kan endre seg. Arealet for én verdikategori i Oslo har vekslet med én dekar mellom to
  kjøringer samme dag, uten endring i koden. Årsaken er ikke funnet.
- Siden er testet i Chromium med mobilvisning. Den er ikke testet systematisk på andre nettlesere.
