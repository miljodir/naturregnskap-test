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
| `index.html` | Rammen rundt siden: skrifter og inngangen til React |
| `src/main.jsx` | Starter React og laster designsystemets stil, kartets stil og `stil.css` |
| `src/App.jsx` | Hele siden. Tegnes på nytt når motoren melder at tilstanden er endret |
| `src/komponenter/Topp.jsx` | Velgerne for fylke (`MdSelect`) og kommune (`MdComboBox`), og navnet på kommunen |
| `src/komponenter/Kartpanel.jsx` | Kartflaten, merkelappene over kartet, linjen under og egne områder |
| `src/komponenter/Tallpanel.jsx` | Arealklassene, temaradene, tallene for planlagt utbygging, anslått utvikling og land og vann |
| `src/komponenter/Tema.jsx` | Detaljene for verneområder, villrein, verdsatt natur, inngrepsfri natur og grått areal |
| `src/komponenter/Notater.jsx` | Kall-loggen, klassene, om siden og tekniske valg |
| `src/komponenter/deler.jsx` | Komponentene fra designsystemet og små byggeklosser som brukes flere steder |
| `src/stil.css` | Sidens egen stil, bygd på designsystemets variabler, med kartfargene øverst |
| `src/motor/felles.js` | Adresser, rutenett, klasser, tilstanden, formatering av tall, kall-logg og henting med minne |
| `src/motor/nett.js` | Rutenettene for flisene, lerreter, lag som tegnes i nettleseren, og køene for kall |
| `src/motor/farger.js` | Stilen som sendes til NIBIO, tolking av fargene i svaret og fargelegging i nettleseren |
| `src/motor/fliser.js` | Grunnkartet som kartfliser og dagens klasser i en flis |
| `src/motor/oversikt.js` | Oversiktsbildet zoomet ut: det lagrede, eller det nettleseren setter sammen selv |
| `src/motor/plan.js` | Kommuneplanen fra DiBK som kartlag, rutenettet for hele kommunen og arealtallene |
| `src/motor/naturtema.js` | Verneområder, villrein og verdsatt natur fra Miljødirektoratet, og markering av ett område i kartet |
| `src/motor/inon.js` | Inngrepsfri natur |
| `src/motor/graa.js` | Grått areal |
| `src/motor/egne.js` | Egne områder: tegning i kartet, opplasting av plan og sammenligning med kommuneplanen |
| `src/motor/kart.js` | Selve kartet: bakgrunn, grense, klipping mot kommunen, status, måling og trykk i kartet |
| `src/motor/tall.js` | Tallene fra SSB: arealklasser, land og vann, og anslått utvikling |
| `src/motor/start.js` | Valg av kommune, kommunegrensen og oppstart |
| `public/kommuner.json` | Fylker og kommuner med omtrentlig utstrekning |
| `public/oversikt.json`, `public/oversikt/` | Lagrede oversiktsbilder og registeret over dem |
| `vite.config.mjs` | Byggingen: utgavemerke, sidene for METODE og AVHENGIGHETER, og oppsett for md-react |

## Motor og komponenter

Siden er delt i to. Motoren i `src/motor` henter data, regner og styrer kartet (OpenLayers). Komponentene i
`src/komponenter` viser alt annet, og leser det de trenger fra tilstanden i motoren.

- Motoren skriver ikke til siden. Når den har endret tilstanden, kaller den `endret()`. Mange endringer i samme runde gir én
  ny tegning av siden (`useSyncExternalStore` i `App.jsx`).
- Knapper og valg i komponentene kaller funksjoner i motoren, for eksempel `velg`, `byttKlasse`, `byttNatur` og `startTegning`.
- Kartet lages først når kartflaten er tegnet (`startKart` i `start.js`). Knappen for å bytte kommune i kartet plasseres av
  motoren selv mens kartet flyttes.
- Filene i motoren bruker hverandre. På toppnivå, altså når en fil lastes, bruker de bare `felles.js` og `nett.js`, som ikke
  bruker noen andre. Alt annet brukes først når en funksjon kalles. Da spiller det ingen rolle i hvilken rekkefølge filene
  lastes.

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
| `vis` | I motoren: slår kartlag av og på etter tilstanden og melder at siden skal tegnes på nytt. Teksten tegnes av komponentene. |
| `hent`, `sjekk`, `regn`, `velg` | Samordner. Henter data, kaller regnefunksjonene, legger svaret i tilstanden og ber om ny tegning. |

Regnefunksjonene er den delen som kan tas med uendret til en annen løsning. `node verktoy/sjekk-regning.js` kontrollerer at de
holder seg rene. Noen bruker et lerret til å telle piksler, men ingen av dem rører siden.

Komponentene gjør tall om til tekst, med enhet og prosent. Det regnes som tegning. Detaljene for inngrepsfri natur og grått
areal regner også ut noen få prosenter direkte fra tallene i tilstanden.

## Tilstand

All delt tilstand for siden ligger i ett objekt, `app`, øverst i `src/motor/felles.js`: valgt kommune, grensen, tallene fra
SSB, rutenettet for planlagt utbygging, egne områder, hva som er slått på i kartet, og det som står rundt kartet.
Komponentene leser derfra, samordningen skriver dit, og regnefunksjonene bruker det ikke. Temaene fra Miljødirektoratet har
dataene sine i `NATURLAG`, ett objekt per tema. Det motoren deler mellom filene uten at det vises, som tellere og tidtakere,
ligger i `M` i samme fil.

Det som bare er hjelpemidler for én fil, er vanlige variabler i den filen: minner for svar og bilder, tellere som skiller
gamle svar fra nye, tidtakere og måling.

## Miljødirektoratets designsystem

Siden følger Miljødirektoratets designsystem (<https://design.miljodirektoratet.no>) med komponentene fra
`@miljodirektoratet/md-react` og stilen fra `@miljodirektoratet/md-css`. Klassene og HTML-strukturen står i designsystemets
[Storybook](https://miljodir.github.io/md-components). Versjonene står i `package.json`.

- `src/main.jsx` henter hele md-css. `src/stil.css` lastes etter og bruker designsystemets variabler (`--md-...`) til tekst,
  flater, kanter, fokus og skrift. Sidens egne navn (`--ink`, `--surface`, `--line` osv.) peker dit, så resten av stilen
  følger med.
- I bruk: `MdSelect` for fylke, `MdComboBox` for kommune (man kan skrive for å filtrere), `MdAccordionItem` for detaljene i
  temaradene, `MdButton`, `MdLink` og
  `MdCheckbox`. Meldingene om kommuneplan og egne områder bruker klassene til `MdAlertMessage`, fordi de har ren tekst uten
  ikon. Et valg som er slått på (`aria-pressed`), vises som primærknapp.
- md-react er CommonJS. Komponentene hentes derfor fra hver sin fil (`@miljodirektoratet/md-react/dist/button/MdButton`),
  og `vite.config.mjs` peker Ariakit til ESM-utgaven, ellers lar ikke bygget seg kjøre.
- Designsystemet har ikke mørkt tema, så siden har det heller ikke.
- Skriftene er Open Sans og Sofia Pro. Open Sans lastes fra Google Fonts. Sofia Pro er en lisensiert skrift som ikke følger
  med siden. Overskriftene bruker den hvis den finnes på enheten, ellers Open Sans. Om lisensen dekker adressene siden
  ligger på, må avklares før skriften legges ut.
- Det designsystemet ikke har, er laget selv med designsystemets variabler: tabeller, stolpene som viser fordeling,
  tegnforklaringer med fargeruter, radene som slår lag av og på, og alt i kartet.
- Kartfargene for arealklasser og tema er data, ikke utforming, og følger ikke designsystemet.

## Videre

- Flere deler kan bruke md-react direkte: lag av og på (`MdToggle`,
  `MdFilterChip`), opplasting (`MdFileUpload`), meldinger med ikon (`MdAlertMessage`), venting (`MdLoadingSpinner`) og
  hjelpetekst (`MdHelpText`, `MdTooltip`). Det endrer utseendet, så regresjonstesten må da få nye referansebilder og
  selektorer.
- De store rutenettene og bildene ligger i tilstanden sammen med tallene. Skal tilstanden flyttes til React eller et eget
  lager, bør de ligge utenfor, med bare tallene inni.

## Utvikle og legge ut en endring

1. `npm install` én gang. `npm run dev` starter siden lokalt og laster på nytt ved endringer.
2. Gjør endringen. `npm run sjekk` og `npm run test` før større endringer.
3. Commit og push til `main`. Arbeidsflyten `.github/workflows/pages.yml` kjører sjekkene, bygger siden og legger den ut på
   GitHub Pages. Utgavemerket settes ved byggingen og vises under «Vis teknisk informasjon».

`npm run build` lager det ferdige bygget i `dist/`, og `npm run preview` viser det lokalt. Sidene for METODE og
AVHENGIGHETER lages fra markdown-filene ved byggingen og finnes ikke under `npm run dev`.

## Verktøy

Verktøyene ligger i `verktoy/` og trengs bare under utvikling.

- `regresjon.js` bygger siden og kjører et fast sett handlinger i en mobilnettleser for Trondheim, Surnadal og Oslo, og
  lagrer tallene siden viser og skjermbilder av kartet. `node verktoy/regresjon.js ut/ny --mot HEAD` (eller `npm run test`)
  sammenligner arbeidskopien med siste commit. Tallene kommer fra åpne tjenester og endrer seg over tid, så de to
  kjøringene må tas samme dag. Ett kjent avvik som ikke skyldes koden: arealet for én verdikategori i Oslo veksler med
  én dekar mellom kjøringer. Testen finner elementene på `id`, så de må beholdes når komponentene endres. Skjermbildene
  er av kartet alene, men flyttes kartet en brøkdel av en piksel på siden, gir det små avvik i hele bildet.
- `sjekk-regning.js` kontrollerer skillet mellom regning og tegning i `src/motor`, se over. `npm run sjekk` kjører den.
- `oversiktsbilde.py` lager de lagrede oversiktsbildene i `public/`, for eksempel
  `python3 verktoy/oversiktsbilde.py --fylke 50`. Én kommune koster 4 til 16 kall mot NIBIO.
- `testdata/testplan-bygg.geojson` er tolv planflater fra Trondheim, hentet fra DiBK, til test av opplasting.

`npm run formater` formaterer koden etter `.prettierrc.json`.

## Kilder

Grunnkart for arealanalyse og kart over grå arealer: NIBIO. Arealtall: SSB, tabell 09594. Kommuneplaner: DiBK.
Verneområder, villreinområder, naturtyper og inngrepsfri natur: Miljødirektoratet. Grenser og bakgrunnskart: Kartverket.
