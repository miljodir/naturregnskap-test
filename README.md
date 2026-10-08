# Kommunalt naturregnskap – teknologidemo

En statisk nettside som viser arealet i en kommune delt i bebygd, jordbruk og natur, hva kommuneplanen setter av til
utbygging, og hvordan det treffer verneområder, villrein, verdsatt natur, inngrepsfri natur og grått areal. Alt hentes
direkte fra åpne tjenester i nettleseren. Det finnes ingen egen server og ikke noe byggesteg.

Siden ligger på <https://miljodir.github.io/naturregnskap-test/>. Legg til `?teknisk` i adressen for å se utgave, måling og
kall-logg.

Dette er en prototype til illustrasjon. Kartet og arealene som regnes ut i nettleseren, er omtrentlige. Grunnkartet fra
NIBIO er lisensiert «Norge digitalt begrenset».

## Filene

| Fil | Innhold |
|---|---|
| `index.html` | Sidens innhold og rekkefølgen skriptene lastes i |
| `md.css` | Delene av Miljødirektoratets designsystem siden bruker, laget av `verktoy/md-css.js` |
| `stil.css` | Sidens egen stil, bygd på designsystemets variabler, med kartfargene øverst |
| `js/felles.js` | Adresser, rutenett, klasser, formatering av tall, kall-logg, henting med minne og små hjelpere |
| `js/farger.js` | Stilen som sendes til NIBIO, tolking av fargene i svaret og fargelegging i nettleseren |
| `js/fliser.js` | Grunnkartet som kartfliser, køen for kall, og hjelpere for lag som tegnes i nettleseren |
| `js/oversikt.js` | Oversiktsbildet zoomet ut: det lagrede, eller det nettleseren setter sammen selv |
| `js/plan.js` | Kommuneplanen fra DiBK som kartlag, rutenettet for hele kommunen og arealtallene |
| `js/naturtema.js` | Verneområder, villrein og verdsatt natur fra Miljødirektoratet, og markering av ett område i kartet |
| `js/inon.js` | Inngrepsfri natur |
| `js/graa.js` | Grått areal |
| `js/egne.js` | Egne områder: tegning i kartet, opplasting av plan og sammenligning med kommuneplanen |
| `js/kart.js` | Selve kartet: bakgrunn, grense, klipping mot kommunen, status, måling og trykk i kartet |
| `js/tall.js` | Tallene fra SSB: arealklasser, land og vann, og anslått utvikling |
| `js/start.js` | Tallpanelet, knappene, valg av kommune og oppstart |
| `kommuner.json` | Fylker og kommuner med omtrentlig utstrekning |
| `oversikt.json`, `oversikt/` | Lagrede oversiktsbilder og registeret over dem |

Skriptene er vanlige skript, ikke moduler. De deler ett navnerom og lastes i den rekkefølgen `index.html` lister dem.
En fil kan bruke alt fra filene over seg når den lastes, og alt fra alle filene når siden kjører. Navn på toppnivå må
derfor være unike på tvers av filene. De må heller ikke være like en `id` i `index.html`: nettleseren lager selv et
globalt navn for hvert element med `id`, og eldre utgaver av Safari nektet å laste et skript som brukte samme navn.
`node verktoy/sjekk-navn.js` kontrollerer begge deler, og at ingen fil bruker et navn som ikke finnes.

## Dokumentasjon

- [METODE.md](METODE.md) beskriver hvert tall siden viser: hva som hentes, hva som regnes ut, og hvor sikkert det er.
- [AVHENGIGHETER.md](AVHENGIGHETER.md) lister biblioteker, tjenester og verktøy, med lisenser og det som gjelder sikkerhet og
  personvern.

Begge må oppdateres når en metode, en kilde eller et bibliotek endres.

## Regning og tegning

Koden holder tre ting fra hverandre, og navnet på en funksjon sier hvilken den er:

| Navn begynner med | Hva funksjonen gjør |
|---|---|
| `tolk`, `kryss`, `bygg`, `tell`, `les` | Regner. Får alt som argumenter og gir svaret tilbake. Leser ikke fra siden, skriver ikke til den, henter ikke fra nettet og bruker ikke delt tilstand. |
| `vis` | Tegner. Leser tilstanden og skriver til siden eller kartet. Regner ikke ut nye tall. |
| `hent`, `sjekk`, `regn`, `velg` | Samordner. Henter data, kaller regnefunksjonene, legger svaret i tilstanden og ber om ny tegning. |

Regnefunksjonene er den delen som kan tas med uendret til en annen løsning. `node verktoy/sjekk-regning.js` kontrollerer at de
holder seg rene. Noen bruker et lerret til å telle piksler, men ingen av dem rører siden.

Tegnefunksjonene gjør fortsatt tall om til tekst, med enhet og prosent. Det regnes som tegning. `visGraa` og `visInon` regner
også ut noen få prosenter direkte fra tallene i tilstanden.

## Tilstand

All delt tilstand ligger i ett objekt, `app`, øverst i `js/felles.js`: valgt kommune, grensen, tallene fra SSB, rutenettet for
planlagt utbygging, egne områder og hva som er slått på i kartet. Tegnefunksjonene leser derfra, samordningen skriver dit, og
regnefunksjonene bruker det ikke. Temaene fra Miljødirektoratet har dataene sine i `NATURLAG`, ett objekt per tema.

Det som bare er hjelpemidler for én fil, er vanlige variabler i den filen: minner for svar og bilder, tellere som skiller
gamle svar fra nye, tidtakere og måling.

## Miljødirektoratets designsystem

Siden følger Miljødirektoratets designsystem (<https://design.miljodirektoratet.no>) med stilen fra
`@miljodirektoratet/md-css`, uten React. Klassene og HTML-strukturen er de som står i designsystemets
[Storybook](https://miljodir.github.io/md-components) og i README-filene i pakken.

- `md.css` er de delene av pakken siden bruker, samlet i én fil: variablene (farger, størrelser, skrift), typografi,
  knapp, lenke, avkrysning og melding. Filen lages av `npm run md-css` og endres ikke for hånd. Versjonen står i
  `package.json`.
- `stil.css` bruker designsystemets variabler (`--md-...`) til tekst, flater, kanter, fokus og skrift. Sidens egne navn
  (`--ink`, `--surface`, `--line` osv.) peker dit, så resten av stilen følger med.
- I bruk: `md-button` (primær, sekundær og tertiær), `md-link`, `md-checkbox` og `md-alert-message`. Et valg som er slått
  på (`aria-pressed`), vises som primærknapp.
- Fylke og kommune er vanlige `select`-elementer med utseendet til `MdSelect`. `MdSelect` bygger på Ariakit og krever React.
- Designsystemet har ikke mørkt tema, så siden har det heller ikke lenger.
- Skriftene er Open Sans og Sofia Pro. Open Sans lastes fra Google Fonts. Sofia Pro er en lisensiert skrift som ikke følger
  med siden. Overskriftene bruker den hvis den finnes på enheten, ellers Open Sans. Om siden kan levere Sofia Pro selv, må
  avklares med Miljødirektoratet.
- Det designsystemet ikke har, er laget selv med designsystemets variabler: tabeller, stolpene som viser fordeling,
  tegnforklaringer med fargeruter, radene som slår lag av og på, og alt i kartet.
- Kartfargene for arealklasser og tema er data, ikke utforming, og følger ikke designsystemet.

## Veien til React

Løsningen skal etter hvert over på React og komponentene i `@miljodirektoratet/md-react` (6.35.0). Komponentene krever React
19.2.5 og bygger på Ariakit. Dette er det som er kartlagt, per oktober 2026:

- Det som dekkes direkte: velgere for fylke og kommune (`MdSelect`, `MdComboBox`), knapper og lenker (`MdButton`, `MdLink`),
  detaljer som åpnes (`MdAccordion`), lag av og på (`MdToggle`, `MdCheckbox`, `MdFilterChip`), opplasting (`MdFileUpload`),
  meldinger som «ingen kommuneplan» (`MdAlertMessage`, `MdInfoBox`), venting (`MdLoadingSpinner`), hjelpetekst (`MdHelpText`,
  `MdTooltip`), merkelapper (`MdTag`, `MdBadge`), faner og fliser til temasider (`MdTabs`, `MdTile`).
- Klassene som allerede er i bruk, er de samme som React-komponentene lager, så utseendet endres lite ved overgangen.

Det som gjør overgangen enklere, er skillet over: regnefunksjonene flyttes, `vis`-funksjonene skrives om til komponenter, og
`app` blir lageret. De store rutenettene og bildene bør da ligge utenfor lageret, med bare tallene inni.

## Legge ut en endring

1. Gjør endringen.
2. `python3 verktoy/utgave.py` setter nytt utgavemerke. Hver fil hentes med utgaven i adressen, så nettleseren ikke
   blander ny `index.html` med gammel kode.
3. Commit og push til `main`. GitHub Pages legger ut siden.

## Verktøy

Verktøyene ligger i `verktoy/` og trengs bare under utvikling.

- `utgave.py` setter utgavemerke, se over.
- `regresjon.js` kjører et fast sett handlinger i en mobilnettleser for Trondheim, Surnadal og Oslo, og lagrer tallene
  siden viser og skjermbilder av kartet. `node verktoy/regresjon.js ut/ny --mot HEAD` sammenligner arbeidskopien med
  siste commit. Tallene kommer fra åpne tjenester og endrer seg over tid, så de to kjøringene må tas samme dag.
  Ett kjent avvik som ikke skyldes koden: arealet for én verdikategori i Oslo veksler med én dekar mellom kjøringer.
- `sjekk-regning.js` kontrollerer skillet mellom regning og tegning, og `sjekk-navn.js` navnene i skriptene, se over.
  `npm run sjekk` kjører begge.
- `md-css.js` lager `md.css` fra designsystemets pakke, se over. `npm run md-css` etter `npm install`.
- `oversiktsbilde.py` lager de lagrede oversiktsbildene, for eksempel `python3 verktoy/oversiktsbilde.py --fylke 50`.
  Én kommune koster 4 til 16 kall mot NIBIO.
- `testdata/testplan-bygg.geojson` er tolv planflater fra Trondheim, hentet fra DiBK, til test av opplasting.

`npm install` henter Playwright, Prettier og designsystemets stil. `npm run formater` formaterer koden etter `.prettierrc.json`.

## Kilder

Grunnkart for arealanalyse og kart over grå arealer: NIBIO. Arealtall: SSB, tabell 09594. Kommuneplaner: DiBK.
Verneområder, villreinområder, naturtyper og inngrepsfri natur: Miljødirektoratet. Grenser og bakgrunnskart: Kartverket.
