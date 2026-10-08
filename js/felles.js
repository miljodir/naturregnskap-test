/* Felles for hele siden: adresser, rutenett, klasser, formatering av tall, kall-logg og henting med minne. */
const WMS = 'https://wms.nibio.no/cgi-bin/grunnkart_arealanalyse';
const KV = 'https://api.kartverket.no/kommuneinfo/v1';
const SSB = 'https://data.ssb.no/api/pxwebapi/v2/tables/09594/data';
/* Kartet bruker UTM sone 33 (EPSG:25833), som dataene er laget i og som NIBIOs egen kartløsning Kilden bruker.
   Da regner NIBIO målestokken riktig, og flisene kan brukes fra reell 1:50 000. Rutenettet er Kartverkets for UTM33. */
proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
proj4.defs('EPSG:25835', '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
proj4.defs('EPSG:4258', '+proj=longlat +ellps=GRS80 +no_defs +type=crs');
ol.proj.proj4.register(proj4);
const UTM = 'EPSG:25833',
  ORIGO = [-2500000, 9045984],
  OPPLOSNINGER = Array.from({ length: 19 }, (_, z) => 21664 / 2 ** z);
const FLISNIVA = 10; /* groveste flisnivå NIBIO tegner: 512 piksler per flis gir 10,6 meter per piksel, innenfor grensen på 1:50 000 */
const MAKSRES = 30; /* kartet må være zoomet inn til under 30 meter per punkt før flisene fra NIBIO brukes */
const SAMTIDIG = 4; /* høyst fire kall mot NIBIO om gangen */
const SVAKEST = 0.35; /* svakeste farge for en piksel med bare litt planlagt utbygging i seg, så den ikke forsvinner helt */
const MAKSTETTHET = 2; /* telefoner har ofte tre piksler per punkt; to er nok og gir under halvparten så store bilder */
/* Rene farger fra NIBIO, byttes til visningsfarger i nettleseren. De seks er valgt slik at en blanding av to klasser
   (kantpikslene) ikke kan forveksles med en blanding av to andre. */
const DATAFARGE = {
  beb: [255, 0, 0],
  jor: [0, 255, 0],
  nat: [0, 0, 255],
  hav: [255, 128, 255],
  inn: [0, 128, 255],
  elv: [255, 128, 128]
};
const KL = [
  [
    'beb',
    'Bebygd',
    ['bebygdOpparbeidetAreal'],
    ['01', '02', '03', '04', '05', '06', '07', '08-09', '10-11', '12-13', '14']
  ],
  ['jor', 'Jordbruk', ['dyrketmark', 'grasmark'], ['15-16']],
  [
    'nat',
    'Natur',
    ['skog', 'heiBuskmark', 'liteVegetertMark', 'vatmark', 'kyststrenderSvabergDyner'],
    ['17', '18', '19', '20', '21', '24']
  ]
];
/* Vann fargelegges i kartet slik grunnkartet gjør, men er ikke egne kartlag og telles ikke som natur. */
const VANN = [
  ['hav', 'Hav', ['hav']],
  ['inn', 'Innsjø', ['innsjoerVannmagasiner'], '22.01'],
  ['elv', 'Elv', ['elverBekkerKanaler'], '22.02']
];
const ALLE = [...KL, ...VANN],
  JOR = 1,
  NAT = 2; /* plass i ALLE: 0 bebygd, 1 jordbruk, 2 natur, deretter vann */
/* Settes av verktoy/utgave.py ved hver endring, så man ser hvilken utgave en fane kjører */
const VERSJON = '8. oktober kl. 10.55';
const $ = id => document.getElementById(id);
/* All delt tilstand for siden, samlet på ett sted. Tegnefunksjonene leser herfra, og samordningen skriver hit. Regnefunksjonene
   bruker den ikke: de får det de trenger som argumenter. Det som bare er hjelpemidler for én fil, som minner, tellere og tidtakere,
   ligger som vanlige variabler i filen de hører til. Temaene fra Miljødirektoratet har sine data i NATURLAG, ett objekt per tema. */
const app = {
  fylker: [] /* fylkene med kommunene sine, fra kommuner.json */,
  valgt: null /* kommunen som er valgt: { nr, navn, boks } */,
  klipp: null /* kommunens flate som geometri, satt når grensen er hentet */,
  flate: 0 /* kommunens flate i km², land og vann */,
  vis: { beb: true, jor: true, nat: true, hav: true, inn: true, elv: true } /* arealklassene som vises i kartet */,
  oversikter: {} /* kommunene som har lagret oversiktsbilde, med utsnittet bildet dekker */,
  ov: null /* oversiktsbildet for valgt kommune: det lagrede, eller det nettleseren setter sammen (dynamisk) */,
  arealtall:
    null /* tallene fra SSB: { tilstand: 'henter' | 'feil' | 'ok', a: [bebygd, jordbruk, natur] i km², aar } */,
  ssbSum: 0 /* landarealet i km², summen av de tre klassene. 0 til tallene er hentet. */,
  ferskvann: null /* { inn, elv } i km², fra SSB */,
  historie: null /* arealet per klasse i 2017 og i siste år */,
  planPaa: true /* om planlagt utbygging vises i kartet */,
  visSmale: false /* om smale striper vises i kartet */,
  planInfo: null /* om DiBK har en kommuneplan for kommunen, og hvilken */,
  planRaster: null /* rutenettet for planlagt utbygging i hele kommunen, med tallene som er regnet ut fra det */,
  planSum: null /* planlagt utbygging på natur og jordbruk i km², til tabellen over utvikling */,
  planTall:
    null /* hva som skal stå om planlagt utbygging i tallpanelet: tilstand er tom, zoom, regner, feil eller ok */,
  egne: [] /* egne områder, tegnet i kartet eller lastet opp. De finnes så lenge siden er åpen. */,
  inon: null /* inngrepsfri natur i kommunen: tilstand, areal per sone og bildet kartlaget tegnes fra */,
  inonPaa: false,
  graa: null /* grått areal i kommunen: tilstand, areal per trinn og rutene med trinn */,
  graaPaa: false,
  graaKryss: null /* planlagt utbygging krysset med grått areal */,
  slorPaa: true /* om det som ikke er kartlagt, får et slør når verdsatt natur vises */,
  vist: null /* området som er valgt fra en liste og markert i kartet */
};
/* Tidtaking til feilsøking: hvor mye tid de tyngste delene bruker i nettleserens hovedtråd siden siste flytting startet. */
let bruk = {};
const tidSlutt = (navn, t0) => {
  const d = performance.now() - t0,
    b = bruk[navn] || (bruk[navn] = { sum: 0, n: 0, maks: 0 });
  b.sum += d;
  b.n++;
  if (d > b.maks) b.maks = d;
};
const nf = (v, d = 1) => v.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
/* Alle arealer vises i dekar. Internt regnes det i kvadratkilometer, som er enheten SSB oppgir. 1 km² er 1000 dekar.
   I kolonner og lister står forkortelsen «daa», i setninger står «dekar» skrevet ut. */
const dekar = (km2, enhet = 'daa') => {
  const v = km2 * 1000;
  return (v > 0 && v < 0.05 ? 'under 0,1' : nf(v, v < 100 ? 1 : 0)) + ' ' + enhet;
};
const iTekst = km2 => dekar(km2, 'dekar');
const kb = b => (b >= 1048576 ? nf(b / 1048576) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB');

let valgNr = 0;

/* Kall-logg: hvert kall mot en åpen kilde måles i nettleseren. */
const rader = [];
function logg(kilde, hva, ms, bytes, feil) {
  rader.unshift([
    kilde,
    hva,
    feil ? 'feilet' : ms >= 1000 ? nf(ms / 1000) + ' s' : Math.round(ms) + ' ms',
    feil ? '' : kb(bytes),
    feil
  ]);
  rader.length = Math.min(rader.length, 8);
  const tb = $('kallogg');
  tb.textContent = '';
  rader.forEach(r => {
    const tr = tb.insertRow();
    r.slice(0, 4).forEach((v, i) => {
      const td = tr.insertCell();
      td.textContent = v;
      if (i > 1) td.className = 'r' + (r[4] ? ' feil' : '');
    });
  });
}
/* Svarene huskes så lenge siden er åpen. Bytter man tilbake til en kommune, hentes verken grense, tall eller plansjekk på nytt.
   Ingenting lagres varig i nettleseren. */
const svar = new Map();
async function hent(kilde, hva, url, stille, bytes, glem, kropp) {
  const nokkel = kropp ? url + ' ' + kropp : url;
  if (svar.has(nokkel)) return svar.get(nokkel);
  const t0 = performance.now();
  try {
    const r = await fetch(url, kropp ? { method: 'POST', body: kropp } : undefined);
    if (!r.ok) throw new Error(r.status);
    const b = await r.blob();
    logg(kilde, hva, performance.now() - t0, b.size);
    const verdi = bytes ? await b.arrayBuffer() : JSON.parse(await b.text());
    if (!glem) husk(svar, nokkel, verdi, 80);
    return verdi;
  } catch (e) {
    if (!stille) logg(kilde, hva, 0, 0, true);
    throw e;
  }
}
const RUTE = (OPPLOSNINGER[9] / 2) ** 2 / 1e6; /* km² per rute i rutenettet */

/* Flatene i en geometri som liste, enten den er én flate eller flere: fra GeoJSON, og fra OpenLayers. */
const flerflate = g => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);
const flater = geom => (geom.getType() === 'MultiPolygon' ? geom.getCoordinates() : [geom.getCoordinates()]);
/* Arealet i kartet er litt større enn i terrenget, og mer jo lenger fra midtlinjen i UTM-sonen. */
const utm33 = geom => {
  const u = geom.getExtent(),
    k = 0.9996 * (1 + ((u[0] + u[2]) / 2 - 500000) ** 2 / (2 * 6.38e6 ** 2));
  return k * k * 1e6;
}; /* m² i kartet per km² i terrenget */
/* Rutenett over et utsnitt e: høyst maks ruter på lengste side, og ruter på minst `minst` meter. u er utsnittet rutene dekker. */
const rutenett = (e, maks, minst = 0) => {
  const res = Math.max(minst, Math.max(e[2] - e[0], e[3] - e[1]) / maks),
    w = Math.ceil((e[2] - e[0]) / res),
    h = Math.ceil((e[3] - e[1]) / res);
  return { res, w, h, u: [e[0], e[3] - h * res, e[0] + w * res, e[3]] };
};
/* Et lerret som pikslene skal leses fra. */
const tegneflate = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d', { willReadFrequently: true });
};
/* Minne med fast plass: det eldste går ut når det blir fullt, og det som legges inn på nytt, regnes som nytt. */
const husk = (minne, nokkel, verdi, plass) => {
  minne.delete(nokkel);
  minne.set(nokkel, verdi);
  if (minne.size > plass) minne.delete(minne.keys().next().value);
};
/* Resultater merkes med kommunenummeret de gjelder. Dette gir resultatet hvis det gjelder kommunen som er valgt nå, ellers ingenting. */
const gjeldende = x => (x && app.valgt && x.nr === app.valgt.nr ? x : null);
/* Brukeren har bedt om mindre bevegelse: da flyttes ikke kart og side mykt. */
const rolig = () => !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const tilKartet = mykt =>
  document.querySelector('.stage').scrollIntoView({ behavior: mykt && !rolig() ? 'smooth' : 'auto', block: 'nearest' });
/* En celle i en tabell, med et mindre tall under hvis det er oppgitt. */
function celle(rad, tekst, under, type = 'td') {
  const c = document.createElement(type);
  c.textContent = tekst;
  if (under) {
    const m = document.createElement('small');
    m.textContent = under;
    c.appendChild(m);
  }
  rad.appendChild(c);
  return c;
}
