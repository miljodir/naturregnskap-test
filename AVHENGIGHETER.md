# Biblioteker, tjenester og verktøy

Dette dokumentet lister alt siden er avhengig av utenfor sin egen kode: biblioteker som lastes i nettleseren, tjenester den
henter data fra, og verktøy som brukes under utvikling. Det følger koden slik den var i utgaven fra 7. oktober 2026.

## Rammeverk

Siden bruker ikke noe rammeverk og har ikke noe byggesteg. Den er skrevet i vanlig JavaScript, HTML og CSS, og filene i repoet
er de samme som nettleseren laster. Det finnes ingen egen server og ingen database.

## Biblioteker som lastes i nettleseren

| Bibliotek | Versjon | Lisens | Lastes fra | Brukes til | Størrelse pakket |
|---|---|---|---|---|---|
| OpenLayers (`ol`) | 10.6.1 | BSD 2-Clause | cdn.jsdelivr.net | Kartet: lag, fliser, tegning av flater, zoom og måling av areal | 234 kB, pluss 1,5 kB stil |
| proj4js | 2.11.0 | MIT | cdnjs.cloudflare.com | Koordinatsystemer: UTM sone 32, 33 og 35 og grader, blant annet for opplastede planer | 30 kB |
| polygon-clipping | 0.15.7 | MIT | cdn.jsdelivr.net | Klipping av verneområder og villreinområder mot kommunegrensen, og sammenslåing av dekningsflater | 9 kB |

Versjonene er låst i adressene i `index.html`. Sidens egen kode er til sammenligning rundt 75 kB pakket.

## Skrifter

Familjen Grotesk og Instrument Sans lastes fra Google Fonts (fonts.googleapis.com og fonts.gstatic.com). Begge har SIL Open
Font License 1.1. Mangler de, faller siden tilbake på skriftene som finnes på enheten.

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

Lagret sammen med siden ligger listen over fylker og kommuner (`kommuner.json`, fra Kartverket) og oversiktsbildene for 39
kommuner (`oversikt/`, laget fra NIBIOs grunnkart).

## Drift

Siden ligger på GitHub Pages og legges ut ved push til `main` i repoet `eirikvk/Publicdemorepo`.

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
- Nettleseren kontakter ti verter utenfor siden: de to som leverer biblioteker, de to som leverer skrifter, og seks hos
  dataeierne. Hver av dem ser brukerens IP-adresse og hvilken side kallet kommer fra, og kallene til dataeierne viser hvilken
  kommune og hvilket kartutsnitt brukeren ser på.
- Bibliotekene lastes uten integritetssjekk (`integrity`-attributt). Endres en fil hos leverandøren, kjører nettleseren den
  likevel. Dette bør rettes, enten med integritetssjekk eller ved å legge bibliotekene sammen med siden.

## Verktøy under utvikling

Ingen av disse følger med siden til brukeren.

| Verktøy | Lisens | Brukes til |
|---|---|---|
| Playwright | Apache 2.0 | Regresjonstesten, som kjører siden i Chromium |
| Prettier 3.9.9 | MIT | Formatering av koden |
| acorn, acorn-walk | MIT | Sjekken av skillet mellom regning og tegning |
| eslint-scope | BSD 2-Clause | Sjekken av navnene i skriptene |
| Python med NumPy, Pillow og Shapely | BSD og lignende | Bygging av oversiktsbildene |

## Planlagt

Løsningen skal etter hvert over på React og Miljødirektoratets designsystem (`@miljodirektoratet/md-react` og
`@miljodirektoratet/md-css`). Det er ikke tatt i bruk. Se README for hva som er kartlagt.
