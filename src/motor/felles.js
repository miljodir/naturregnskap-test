/* Felles for hele siden: adresser, rutenett, klasser, formatering av tall, kall-logg, henting med minne og tilstanden. */
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';

export const WMS = 'https://wms.nibio.no/cgi-bin/grunnkart_arealanalyse';
export const KV = 'https://api.kartverket.no/kommuneinfo/v1';
export const SSB = 'https://data.ssb.no/api/pxwebapi/v2/tables/09594/data';
/* Kartet bruker UTM sone 33 (EPSG:25833), som dataene er laget i og som NIBIOs egen kartløsning Kilden bruker.
   Da regner NIBIO målestokken riktig, og flisene kan brukes fra reell 1:50 000. Rutenettet er Kartverkets for UTM33. */
proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
proj4.defs('EPSG:25835', '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
proj4.defs('EPSG:4258', '+proj=longlat +ellps=GRS80 +no_defs +type=crs');
register(proj4);
export const UTM = 'EPSG:25833',
  ORIGO = [-2500000, 9045984],
  OPPLOSNINGER = Array.from({ length: 19 }, (_, z) => 21664 / 2 ** z);
export const FLISNIVA = 10; /* groveste flisnivå NIBIO tegner: 512 piksler per flis gir 10,6 meter per piksel, innenfor grensen på 1:50 000 */
export const MAKSRES = 30; /* kartet må være zoomet inn til under 30 meter per punkt før flisene fra NIBIO brukes */
export const SAMTIDIG = 4; /* høyst fire kall mot NIBIO om gangen */
export const SVAKEST = 0.35; /* svakeste farge for en piksel med bare litt planlagt utbygging i seg, så den ikke forsvinner helt */
export const MAKSTETTHET = 2; /* telefoner har ofte tre piksler per punkt; to er nok og gir under halvparten så store bilder */
/* Rene farger fra NIBIO, byttes til visningsfarger i nettleseren. De seks er valgt slik at en blanding av to klasser
   (kantpikslene) ikke kan forveksles med en blanding av to andre. */
export const DATAFARGE = {
  beb: [255, 0, 0],
  jor: [0, 255, 0],
  nat: [0, 0, 255],
  hav: [255, 128, 255],
  inn: [0, 128, 255],
  elv: [255, 128, 128]
};
export const KL = [
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
export const VANN = [
  ['hav', 'Hav', ['hav']],
  ['inn', 'Innsjø', ['innsjoerVannmagasiner'], '22.01'],
  ['elv', 'Elv', ['elverBekkerKanaler'], '22.02']
];
export const ALLE = [...KL, ...VANN],
  JOR = 1,
  NAT = 2; /* plass i ALLE: 0 bebygd, 1 jordbruk, 2 natur, deretter vann */
/* Settes når siden bygges (vite.config.mjs), så man ser hvilken utgave en fane kjører */
export const VERSJON = typeof __UTGAVE__ === 'undefined' ? 'lokal utvikling' : __UTGAVE__.tekst;

/* All delt tilstand for siden, samlet på ett sted. Komponentene leser herfra, og samordningen skriver hit. Regnefunksjonene
   bruker den ikke: de får det de trenger som argumenter. Temaene fra Miljødirektoratet har sine data i NATURLAG, ett objekt per tema. */
export const app = {
  fylker: [] /* fylkene med kommunene sine, fra kommuner.json */,
  kommunerFeil: false /* om listen over kommuner ikke kunne hentes */,
  valgt: null /* kommunen som er valgt: { nr, navn, boks } */,
  klipp: null /* kommunens flate som geometri, satt når grensen er hentet */,
  flate: 0 /* kommunens flate i km², land og vann */,
  vis: { beb: true, jor: true, nat: true, hav: true, inn: true, elv: true } /* arealklassene som vises i kartet */,
  oversikter: {} /* kommunene som har lagret oversiktsbilde, med utsnittet bildet dekker */,
  register: null /* opplysningene om de lagrede oversiktsbildene: { versjon, hentet } */,
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
  egneStatus: '' /* melding om siste opplasting eller tegning */,
  tegner: false /* om et eget område tegnes i kartet nå */,
  inon: null /* inngrepsfri natur i kommunen: tilstand, areal per sone og bildet kartlaget tegnes fra */,
  inonPaa: false,
  graa: null /* grått areal i kommunen: tilstand, areal per trinn og rutene med trinn */,
  graaPaa: false,
  graaKryss: null /* planlagt utbygging krysset med grått areal */,
  slorPaa: true /* om det som ikke er kartlagt, får et slør når verdsatt natur vises */,
  vist: null /* området som er valgt fra en liste og markert i kartet: { t, liId, navn } */,
  apne: {} /* temaradene som er åpnet i tallpanelet, etter id */,
  /* Det som vises rundt kartet */
  laster: false /* om det hentes kart nå */,
  ute: false /* om kartet er zoomet ut der det ikke finnes noe oversiktsbilde */,
  sidezoom: false /* om selve siden er forstørret */,
  siste: '' /* siste kall mot kartet, under kartet */,
  probe: {
    tekst: 'Trykk i kommunen for å se klassen, eller utenfor for å bytte kommune.'
  } /* svaret på et trykk i kartet: tekst, eller fet tekst etter «Valgt punkt:» */,
  bytt: null /* kommunen i punktet man trykket utenfor valgt kommune: { nr, navn } */,
  kall: [] /* de siste kallene mot åpne kilder */,
  maaling: '' /* måling av hvor jevnt kartet går */
};
/* Delt tilstand for motoren: det som flere filer setter og leser, men som ikke vises. */
export const M = {
  valgNr: 0 /* øker for hver kommune som velges, så svar for en tidligere kommune kan kastes */,
  iBevegelse: false,
  nyeKall: false,
  feilIVisning: false,
  ovBilde: null /* det lagrede oversiktsbildet som bilde, til utregning */,
  ovRes: 0 /* kartmeter per piksel i oversiktsbildet */,
  samle: null /* det sammensatte kartet for valgt kommune */,
  etterTimer: null,
  etterVenter: false,
  bruk: {} /* tidtaking til feilsøking */
};

/* Komponentene tegnes på nytt når tilstanden er endret. Mange endringer i samme runde gir én ny tegning. */
const lyttere = new Set();
let versjon = 0,
  varslet = false;
export const lytt = f => {
  lyttere.add(f);
  return () => lyttere.delete(f);
};
export const versjonNa = () => versjon;
export function endret() {
  if (varslet) return;
  varslet = true;
  queueMicrotask(() => {
    varslet = false;
    versjon++;
    lyttere.forEach(f => f());
  });
}

/* Fargene leses fra stilarket én gang og huskes. Å spørre stilarket for hver flis tvinger nettleseren
   til å regne ut stiler på nytt midt i tegningen. */
const fargeMinne = {},
  rgbMinne = {};
export const farge = id =>
  fargeMinne[id] ||
  (fargeMinne[id] = getComputedStyle(document.documentElement)
    .getPropertyValue('--' + id)
    .trim());
export const rgb = id =>
  rgbMinne[id] || (rgbMinne[id] = (v => [0, 2, 4].map(i => parseInt(v.substr(i, 2), 16)))(farge(id).replace('#', '')));

/* Tidtaking til feilsøking: hvor mye tid de tyngste delene bruker i nettleserens hovedtråd siden siste flytting startet. */
export const tidSlutt = (navn, t0) => {
  const d = performance.now() - t0,
    b = M.bruk[navn] || (M.bruk[navn] = { sum: 0, n: 0, maks: 0 });
  b.sum += d;
  b.n++;
  if (d > b.maks) b.maks = d;
};
export const nf = (v, d = 1) => v.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
/* Alle arealer vises i dekar. Internt regnes det i kvadratkilometer, som er enheten SSB oppgir. 1 km² er 1000 dekar.
   I kolonner og lister står forkortelsen «daa», i setninger står «dekar» skrevet ut. */
export const dekar = (km2, enhet = 'daa') => {
  const v = km2 * 1000;
  return (v > 0 && v < 0.05 ? 'under 0,1' : nf(v, v < 100 ? 1 : 0)) + ' ' + enhet;
};
export const iTekst = km2 => dekar(km2, 'dekar');
export const kb = b => (b >= 1048576 ? nf(b / 1048576) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB');

/* Kall-logg: hvert kall mot en åpen kilde måles i nettleseren. */
export function logg(kilde, hva, ms, bytes, feil) {
  app.kall = [
    [
      kilde,
      hva,
      feil ? 'feilet' : ms >= 1000 ? nf(ms / 1000) + ' s' : Math.round(ms) + ' ms',
      feil ? '' : kb(bytes),
      feil
    ],
    ...app.kall
  ].slice(0, 8);
  endret();
}
/* Svarene huskes så lenge siden er åpen. Bytter man tilbake til en kommune, hentes verken grense, tall eller plansjekk på nytt.
   Ingenting lagres varig i nettleseren. */
const svar = new Map();
export async function hent(kilde, hva, url, stille, bytes, glem, kropp) {
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
export const RUTE = (OPPLOSNINGER[9] / 2) ** 2 / 1e6; /* km² per rute i rutenettet */

/* Flatene i en geometri som liste, enten den er én flate eller flere: fra GeoJSON, og fra OpenLayers. */
export const flerflate = g => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);
export const flater = geom => (geom.getType() === 'MultiPolygon' ? geom.getCoordinates() : [geom.getCoordinates()]);
/* Arealet i kartet er litt større enn i terrenget, og mer jo lenger fra midtlinjen i UTM-sonen. */
export const utm33 = geom => {
  const u = geom.getExtent(),
    k = 0.9996 * (1 + ((u[0] + u[2]) / 2 - 500000) ** 2 / (2 * 6.38e6 ** 2));
  return k * k * 1e6;
}; /* m² i kartet per km² i terrenget */
/* Rutenett over et utsnitt e: høyst maks ruter på lengste side, og ruter på minst `minst` meter. u er utsnittet rutene dekker. */
export const rutenett = (e, maks, minst = 0) => {
  const res = Math.max(minst, Math.max(e[2] - e[0], e[3] - e[1]) / maks),
    w = Math.ceil((e[2] - e[0]) / res),
    h = Math.ceil((e[3] - e[1]) / res);
  return { res, w, h, u: [e[0], e[3] - h * res, e[0] + w * res, e[3]] };
};
/* Et lerret som pikslene skal leses fra. */
export const tegneflate = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d', { willReadFrequently: true });
};
/* Minne med fast plass: det eldste går ut når det blir fullt, og det som legges inn på nytt, regnes som nytt. */
export const husk = (minne, nokkel, verdi, plass) => {
  minne.delete(nokkel);
  minne.set(nokkel, verdi);
  if (minne.size > plass) minne.delete(minne.keys().next().value);
};
/* Resultater merkes med kommunenummeret de gjelder. Dette gir resultatet hvis det gjelder kommunen som er valgt nå, ellers ingenting. */
export const gjeldende = x => (x && app.valgt && x.nr === app.valgt.nr ? x : null);
/* Brukeren har bedt om mindre bevegelse: da flyttes ikke kart og side mykt. */
export const rolig = () => !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const tilKartet = mykt =>
  document.querySelector('.stage').scrollIntoView({ behavior: mykt && !rolig() ? 'smooth' : 'auto', block: 'nearest' });
/* Finner fylket og kommunen for et kommunenummer. */
export const finn = nr => {
  for (const f of app.fylker) for (const k of f.kommuner) if (k.nr === nr) return [f, k];
  return null;
};
