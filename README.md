# Kommunalt naturregnskap – teknologidemo

En statisk nettside som viser arealet i en kommune delt i bebygd, jordbruk og natur, hva kommuneplanen setter av til
utbygging, og hvordan det treffer verneområder, villrein, verdsatt natur, inngrepsfri natur og grått areal. Alt hentes
direkte fra åpne tjenester i nettleseren. Det finnes ingen egen server. Siden bygges med Vite og React og legges ut på
GitHub Pages.

Siden ligger på <https://miljodir.github.io/naturregnskap-test/>. Legg til `?teknisk` i adressen for å se utgave, måling og
kall-logg.

Dette er en prototype til illustrasjon. Kartet og arealene som regnes ut i nettleseren, er omtrentlige. Grunnkartet fra
NIBIO er lisensiert «Norge digitalt begrenset».

## Filene

| Fil | Innhold |
|---|---|
| `index.html` | Rammen rundt siden: skrifter, kartbibliotekene og inngangen til React |
| `src/main.jsx` | Starter React, laster designsystemets stil og `stil.css`, og laster deretter skriptene i `public/js` i rekkefølge |
| `src/App.jsx` | Sidens innhold, med knapper, lenker og avkrysning fra designsystemet (`md-react`) |
| `src/stil.css` | Sidens egen stil, bygd på designsystemets variabler, med kartfargene øverst |
| `public/js/felles.js` | Adresser, rutenett, klasser, formatering av tall, kall-logg, henting med minne og små hjelpere |
| `public/js/farger.js` | Stilen som sendes til NIBIO, tolking av fargene i svaret og fargelegging i nettleseren |
| `public/js/fliser.js` | Grunnkartet som kartfliser, køen for kall, og hjelpere for lag som tegnes i nettleseren |
| `public/js/oversikt.js` | Oversiktsbildet zoomet ut: det lagrede, eller det nettleseren setter sammen selv |
| `public/js/plan.js` | Kommuneplanen fra DiBK som kartlag, rutenettet for hele kommunen og arealtallene |
| `public/js/naturtema.js` | Verneområder, villrein og verdsatt natur fra Miljødirektoratet, og markering av ett område i kartet |
| `public/js/inon.js` | Inngrepsfri natur |
| `public/js/graa.js` | Grått areal |
| `public/js/egne.js` | Egne områder: tegning i kartet, opplasting av plan og sammenligning med kommuneplanen |
| `public/js/kart.js` | Selve kartet: bakgrunn, grense, klipping mot kommunen, status, måling og trykk i kartet |
| `public/js/tall.js` | Tallene fra SSB: arealklasser, land og vann, og anslått utvikling |
| `public/js/start.js` | Tallpanelet, knappene, valg av kommune og oppstart |
| `public/kommuner.json` | Fylker og kommuner med omtrentlig utstrekning |
| `public/oversikt.json`, `public/oversikt/` | Lagrede oversiktsbilder og registeret over dem |
| `vite.config.mjs` | Byggingen: utgavemerke, sidene for METODE og AVHENGIGHETER, og oppsett for md-react |

Skriptene i `public/js` er vanlige skript, ikke moduler, og kopieres uendret til det ferdige bygget. De deler ett navnerom og
lastes i den rekkefølgen `src/main.jsx` lister dem, etter at React har tegnet siden. De finner elementene på `id`. En fil kan
bruke alt fra filene over seg når den lastes, og alt fra alle filene når siden kjører. Navn på toppnivå må derfor være unike
på tvers av filene. De må heller ikke være like en `id` på siden: nettleseren lager selv et globalt navn for hvert element
med `id`, og eldre utgaver av Safari nektet å laste et skript som brukte samme navn. `node verktoy/sjekk-navn.js` kontrollerer
begge deler, med id-ene i `index.html` og `src/*.jsx`, og at ingen fil bruker et navn som ikke finnes.

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

All delt tilstand ligger i ett objekt, `app`, øverst i `public/js/felles.js`: valgt kommune, grensen, tallene fra SSB, rutenettet for
planlagt utbygging, egne områder og hva som er slått på i kartet. Tegnefunksjonene leser derfra, samordningen skriver dit, og
regnefunksjonene bruker det ikke. Temaene fra Miljødirektoratet har dataene sine i `NATURLAG`, ett objekt per tema.

Det som bare er hjelpemidler for én fil, er vanlige variabler i den filen: minner for svar og bilder, tellere som skiller
gamle svar fra nye, tidtakere og måling.

## Miljødirektoratets designsystem

Siden følger Miljødirektoratets designsystem (<https://design.miljodirektoratet.no>) med komponentene fra
`@miljodirektoratet/md-react` og stilen fra `@miljodirektoratet/md-css`. Klassene og HTML-strukturen står i designsystemets
[Storybook](https://miljodir.github.io/md-components). Versjonene står i `package.json`.

- `src/main.jsx` henter hele md-css. `src/stil.css` lastes etter og bruker designsystemets variabler (`--md-...`) til tekst,
  flater, kanter, fokus og skrift. Sidens egne navn (`--ink`, `--surface`, `--line` osv.) peker dit, så resten av stilen
  følger med.
- I `src/App.jsx` er knappene `MdButton`, lenkene `MdLink` og valget av smale striper `MdCheckbox`. Elementer som skriptene i
  `public/js` skriver tekst i, er vanlige elementer med md-klassene (`md-button`, `md-alert-message`), så React og skriptene
  ikke eier det samme innholdet. Knapper og lister som skriptene lager selv, bruker også md-klassene. Et valg som er slått
  på (`aria-pressed`), vises som primærknapp.
- md-react er CommonJS. Komponentene hentes derfor fra hver sin fil (`@miljodirektoratet/md-react/dist/button/MdButton`),
  og `vite.config.mjs` peker Ariakit til ESM-utgaven, ellers lar ikke bygget seg kjøre.
- Fylke og kommune er fortsatt vanlige `select`-elementer med utseendet til `MdSelect`, fordi `start.js` fyller og leser
  dem.
- Designsystemet har ikke mørkt tema, så siden har det heller ikke.
- Skriftene er Open Sans og Sofia Pro. Open Sans lastes fra Google Fonts. Sofia Pro er en lisensiert skrift som ikke følger
  med siden. Overskriftene bruker den hvis den finnes på enheten, ellers Open Sans. Om lisensen dekker adressene siden
  ligger på, må avklares før skriften legges ut.
- Det designsystemet ikke har, er laget selv med designsystemets variabler: tabeller, stolpene som viser fordeling,
  tegnforklaringer med fargeruter, radene som slår lag av og på, og alt i kartet.
- Kartfargene for arealklasser og tema er data, ikke utforming, og følger ikke designsystemet.

## Veien videre i React

Siden bygges med React, men innholdet styres fortsatt av skriptene i `public/js`. Overgangen gjøres en del om gangen:
en `vis`-funksjon blir en komponent, tallene den viser flyttes fra `app` til React, og elementet tas ut av skriptene.
Regresjonstesten skal gi samme tall før og etter hvert steg.

- Det som kan dekkes direkte av md-react: velgere for fylke og kommune (`MdSelect`, `MdComboBox`), detaljer som åpnes
  (`MdAccordion`), lag av og på (`MdToggle`, `MdCheckbox`, `MdFilterChip`), opplasting (`MdFileUpload`), meldinger som
  «ingen kommuneplan» (`MdAlertMessage`, `MdInfoBox`), venting (`MdLoadingSpinner`), hjelpetekst (`MdHelpText`,
  `MdTooltip`), merkelapper (`MdTag`, `MdBadge`), faner og fliser til temasider (`MdTabs`, `MdTile`).
- Regnefunksjonene kan flyttes uendret til moduler. `vis`-funksjonene blir komponenter, og `app` blir lageret. De store
  rutenettene og bildene bør da ligge utenfor lageret, med bare tallene inni.
- Kartet (OpenLayers) og kartbibliotekene kan hentes fra npm i stedet for fra CDN når skriptene som bruker dem, er moduler.

## Utvikle og legge ut en endring

1. `npm install` én gang. `npm run dev` starter siden lokalt og laster på nytt ved endringer.
2. Gjør endringen. `npm run sjekk` og `npm run test` før større endringer.
3. Commit og push til `main`. Arbeidsflyten `.github/workflows/pages.yml` kjører sjekkene, bygger siden og legger den ut på
   GitHub Pages. Utgavemerket settes ved byggingen og står i adressen til skriptene, så nettleseren ikke blander ny side
   med gammel kode.

`npm run build` lager det ferdige bygget i `dist/`, og `npm run preview` viser det lokalt. Sidene for METODE og
AVHENGIGHETER lages fra markdown-filene ved byggingen og finnes ikke under `npm run dev`.

## Verktøy

Verktøyene ligger i `verktoy/` og trengs bare under utvikling.

- `regresjon.js` bygger siden og kjører et fast sett handlinger i en mobilnettleser for Trondheim, Surnadal og Oslo, og
  lagrer tallene siden viser og skjermbilder av kartet. `node verktoy/regresjon.js ut/ny --mot HEAD` (eller `npm run test`)
  sammenligner arbeidskopien med siste commit. Tallene kommer fra åpne tjenester og endrer seg over tid, så de to
  kjøringene må tas samme dag. Ett kjent avvik som ikke skyldes koden: arealet for én verdikategori i Oslo veksler med
  én dekar mellom kjøringer.
- `sjekk-regning.js` kontrollerer skillet mellom regning og tegning, og `sjekk-navn.js` navnene i skriptene, se over.
  `npm run sjekk` kjører begge.
- `oversiktsbilde.py` lager de lagrede oversiktsbildene i `public/`, for eksempel
  `python3 verktoy/oversiktsbilde.py --fylke 50`. Én kommune koster 4 til 16 kall mot NIBIO.
- `testdata/testplan-bygg.geojson` er tolv planflater fra Trondheim, hentet fra DiBK, til test av opplasting.

`npm run formater` formaterer koden etter `.prettierrc.json`.

## Kilder

Grunnkart for arealanalyse og kart over grå arealer: NIBIO. Arealtall: SSB, tabell 09594. Kommuneplaner: DiBK.
Verneområder, villreinområder, naturtyper og inngrepsfri natur: Miljødirektoratet. Grenser og bakgrunnskart: Kartverket.
