# Biblioteker, tjenester og verktøy

Dette dokumentet lister alt siden er avhengig av utenfor sin egen kode: biblioteker som lastes i nettleseren, tjenester den
henter data fra, og verktøy som brukes under utvikling. Det følger koden slik den var i utgaven fra 8. oktober 2026.

## Rammeverk

Siden bruker React og bygges med Vite. Alle biblioteker bygges inn i siden. Bygget er statiske filer. Det finnes ingen egen
server og ingen database.

## Biblioteker som lastes i nettleseren

Alle lastes fra samme sted som siden, i ett samlet bygg. Versjonene er låst i `package.json`.

| Bibliotek | Versjon | Lisens | Brukes til |
|---|---|---|---|
| React og React DOM | 19.2.5 | MIT | Sidens innhold |
| `@miljodirektoratet/md-react` | 6.35.0 | MIT | Velgere, knapper, lenker og avkrysning fra designsystemet. Tar med Ariakit (MIT). |
| `@miljodirektoratet/md-css` | 6.32.0 | MIT | Designsystemets stil |
| OpenLayers (`ol`) | 10.6.1 | BSD 2-Clause | Kartet: lag, fliser, tegning av flater, zoom og måling av areal |
| proj4js | 2.11.0 | MIT | Koordinatsystemer: UTM sone 32, 33 og 35 og grader, blant annet for opplastede planer |
| polygon-clipping | 0.15.7 | MIT | Klipping av verneområder og villreinområder mot kommunegrensen, og sammenslåing av dekningsflater |

Bygget er rundt 320 kB JavaScript og 19 kB stil, pakket.

## Designsystem

Miljødirektoratets designsystem, `@miljodirektoratet/md-react` og `@miljodirektoratet/md-css`, bygges inn i siden og lastes
fra samme sted som siden, ikke fra en ekstern vert. Kilden er `miljodir/md-components` på GitHub.

## Skrifter

Open Sans lastes fra Google Fonts (fonts.googleapis.com og fonts.gstatic.com) og har SIL Open Font License 1.1.
Designsystemets overskriftsskrift, Sofia Pro, er lisensiert fra MyFonts og følger ikke med siden. Den brukes bare hvis den
finnes på enheten. Mangler skriftene, faller siden tilbake på skriftene som finnes på enheten.

## Tjenester siden henter data fra

Alle kall går direkte fra nettleseren til tjenesten. Ingen av dem krever innlogging eller nøkkel.

| Eier | Tjeneste | Adresse | Type | Brukes til |
|---|---|---|---|---|
| SSB | Tabell 09594, nytt API | data.ssb.no/api/pxwebapi/v2 | JSON | Arealtall og tidsserie |
| SSB | Tabell 09594, eldre API | data.ssb.no/api/v0 | JSON | Reserve når det nye ikke svarer |
| Kartverket | Kommuneinfo | api.kartverket.no/kommuneinfo/v1 | JSON | Kommunegrense, og kommune i et punkt |
| Kartverket | Bakgrunnskart, gråtone | cache.kartverket.no | Kartfliser (WMTS) | Bakgrunnen i kartet |
| NIBIO | Grunnkart for arealanalyse | wms.nibio.no/cgi-bin/grunnkart_arealanalyse | WMS | Dagens arealklasser |
| NIBIO | Kart over grå arealer | wms.nibio.no/cgi-bin/graastruktur | WMS | Grått areal |
| DiBK | Kommuneplaner | nap.ft.dibk.no/services/wms/kommuneplaner | WMS | Planlagt utbygging, og opplysninger om planen |
| Miljødirektoratet | Naturvernområder, villrein, naturtyper med KU-verdi, dekningskart | kart.miljodirektoratet.no/arcgis/rest/services | ArcGIS REST | Naturtema som flater |
| Miljødirektoratet | Inngrepsfrie naturområder | kart.miljodirektoratet.no/geoserver/inngrepsfrinatur | WMS | Inngrepsfri natur |

Lagret sammen med siden ligger listen over fylker og kommuner (`public/kommuner.json`, fra Kartverket) og oversiktsbildene for
39 kommuner (`public/oversikt/`, laget fra NIBIOs grunnkart).

## Drift

Siden ligger på GitHub Pages. Ved push til `main` i repoet `miljodir/naturregnskap-test` bygger arbeidsflyten
`.github/workflows/pages.yml` siden og legger den ut. Under Settings → Pages er kilden satt til GitHub Actions.

## Vilkår for dataene

- NIBIOs grunnkart for arealanalyse er lisensiert «Norge digitalt begrenset». Det gjelder både kartflisene og de lagrede
  oversiktsbildene. Dette må avklares før siden brukes utenfor en prototype.
- Kart over grå arealer er en testversjon.
- Vilkårene for de andre tjenestene er ikke kontrollert i dette arbeidet. Siden krediterer Kartverket, NIBIO og DiBK i kartet
  og alle kildene i teksten.
- Siden belaster tjenestene direkte fra hver brukers nettleser. Kall mot NIBIO og DiBK går i kø med høyst fire om gangen per
  kilde, og svar huskes så lenge siden er åpen.

## Sikkerhet og personvern

- Siden setter ingen informasjonskapsler og lagrer ingenting i nettleseren. Valg som teknisk visning og kommune står i adressen.
- Det er ingen måling av bruk og ingen sporing i sidens kode.
- Filer brukeren laster opp, og områder brukeren tegner, leses og regnes i nettleseren og sendes ingen steder.
- Nettleseren kontakter åtte verter utenfor siden: de to som leverer skrifter, og seks hos
  dataeierne. Hver av dem ser brukerens IP-adresse og hvilken side kallet kommer fra, og kallene til dataeierne viser hvilken
  kommune og hvilket kartutsnitt brukeren ser på.
- Bibliotekene ligger i bygget og lastes fra samme sted som siden, så de kan ikke endres hos en leverandør uten at siden
  bygges på nytt.

## Verktøy under utvikling

Ingen av disse følger med siden til brukeren.

| Verktøy | Lisens | Brukes til |
|---|---|---|
| Playwright | Apache 2.0 | Regresjonstesten, som kjører siden i Chromium |
| Vite og @vitejs/plugin-react | MIT | Byggingen av siden og utviklingsserveren |
| marked | MIT | Sidene for METODE og AVHENGIGHETER, laget fra markdown ved byggingen |
| Prettier 3.9.9 | MIT | Formatering av koden |
| acorn, acorn-walk | MIT | Sjekken av skillet mellom regning og tegning |
| Python med NumPy, Pillow og Shapely | BSD og lignende | Bygging av oversiktsbildene |

## Planlagt

Flere deler kan bruke komponentene fra designsystemet direkte. Se README.
