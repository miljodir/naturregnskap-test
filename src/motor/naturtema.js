/* Naturtema fra Miljødirektoratet: verneområder, villrein og verdsatt natur, med kartlag og kryssing mot planen. */
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Point, Polygon, MultiPolygon } from 'ol/geom';
import { Style, Stroke, Fill, Circle } from 'ol/style';
import { getCenter, getIntersection, isEmpty } from 'ol/extent';
import polygonClipping from 'polygon-clipping';
import {
  ORIGO,
  OPPLOSNINGER,
  M,
  app,
  endret,
  farge,
  rgb,
  hent,
  husk,
  flater,
  flerflate,
  utm33,
  rutenett,
  tegneflate,
  tidSlutt,
  rolig,
  tilKartet
} from './felles.js';
import { plannett, lerret, kommuneSti, TOM, tegnetKilde, friskOpp } from './nett.js';
import { utenPlan } from './egne.js';
import { view } from './kart.js';

/* Naturlag fra Miljødirektoratet: verneområder og leveområder for villrein. Tjenestene gir selve flatene med navn og opplysninger,
   ikke bare et bilde. Hvert datasett blir et kartlag med egen knapp og egen del i tallpanelet, og krysses med planlagt utbygging.
   Et nytt datasett av samme slag legges til som en ny linje i listen under. */
const MD = 'https://kart.miljodirektoratet.no/arcgis/rest/services/';
export const NATURLAG = [
  {
    id: 'vern',
    navn: 'Verneområder',
    en: 'verneområde',
    fl: 'verneområder',
    best: 'verneområdene',
    vann: true,
    url: MD + 'vern/MapServer/0/query',
    felt: 'offisieltNavn,verneform,vernedato,faktaark',
    slakk: 5,
    kildetekst: 'Miljødirektoratet, naturvernområder',
    les: p => ({
      navn: p.offisieltNavn || 'Uten navn',
      url: p.faktaark || '',
      under: [
        String(p.verneform || '')
          .replace(/([a-zæøå])([A-ZÆØÅ])/g, '$1 $2')
          .toLowerCase()
          .replace(/omraade/g, 'område')
          .replace(/^./, c => c.toUpperCase()),
        p.vernedato ? 'vernet ' + new Date(p.vernedato).getUTCFullYear() : ''
      ]
        .filter(Boolean)
        .join(', ')
    })
  },
  {
    id: 'rein',
    navn: 'Villrein',
    en: 'villreinområde',
    fl: 'villreinområder',
    best: 'villreinområdene',
    url: MD + 'villrein/MapServer/1/query',
    felt: '*',
    slakk: 20,
    kildetekst: 'Miljødirektoratet, leveområder for villrein',
    les: p => ({
      navn: String(p['villreinområdeNavn'] || 'Uten navn').replace(/\s*-\s*leveområde\s*$/i, ''),
      url: p.faktaark || '',
      under: [
        p['villreinområdeNasjonalt'] === 'Ja' ? 'Nasjonalt villreinområde' : 'Villreinområde',
        p.funksjon ? String(p.funksjon).toLowerCase() : '',
        p.funksjonsperiode ? String(p.funksjonsperiode).toLowerCase() : ''
      ]
        .filter(Boolean)
        .join(', ')
    })
  },
  /* Naturtyper med verdi etter Miljødirektoratets fire verdikategorier. Det er mange små lokaliteter, så de tegnes fylt og uten hvit
     kant, i fire toner av samme farge: mørkere jo høyere verdi. I tallpanelet listes bare lokalitetene som berøres av planlagt utbygging.
     Dekningskartet viser hvor det er kartlagt. Det som ikke er kartlagt, kan få et lyst slør i kartet. */
  {
    id: 'verdi',
    navn: 'Verdsatt natur',
    en: 'verdsatt lokalitet',
    fl: 'verdsatte lokaliteter',
    best: 'lokalitetene',
    samlet: true,
    flate: true,
    avLand: true,
    dekning: true,
    klasser: [
      ['Svært stor verdi', 'verdi1'],
      ['Stor verdi', 'verdi2'],
      ['Middels verdi', 'verdi3'],
      ['Noe verdi', 'verdi4']
    ],
    url: MD + 'naturtyper_kuverdi/MapServer/0/query',
    hvor: nr =>
      `Verdikategori IN ('Svært stor verdi','Stor verdi','Middels verdi','Noe verdi') AND Kommune LIKE '%(${nr})%'`,
    felt: 'Verdikategori,Naturtype,Områdenavn,FaktaarkLokalitet,Faktaark',
    slakk: 5,
    kildetekst: 'Miljødirektoratet, naturtyper med KU-verdi og dekningskart for naturtypekartlegging',
    ekstra: hentDekning,
    les: p => ({
      navn: p['Områdenavn'] || p.Naturtype || 'Uten navn',
      url: p.FaktaarkLokalitet || p.Faktaark || '',
      v: Math.max(0, ['Svært stor verdi', 'Stor verdi', 'Middels verdi', 'Noe verdi'].indexOf(p.Verdikategori)),
      under: [p.Naturtype, String(p.Verdikategori || '').toLowerCase()].filter(Boolean).join(', ')
    })
  }
].map(t => {
  t.kilde = new VectorSource();
  t.minne = new Map();
  t.data = null;
  t.paa = false; /* naturlagene er av når siden åpnes, så kartet starter enkelt */
  /* Bare omriss: en hvit kant og en farget strek. En fylling over hele området måtte tegnes på nytt i hvert bilde når kartet flyttes.
     Laget deler lerret med planlaget, så de klippes samlet. Den store bufferen gjør at alle omrissene i kommunen tegnes i ett, også de
     utenfor utsnittet, så de er på plass mens kartet flyttes. */
  /* Fylte flater tegnes om til kartfliser i nettleseren, slik planlaget gjør. Tusen små flater som vektor måtte tegnes på nytt i hvert
     bilde når kartet flyttes. Som fliser tegnes de én gang og flyttes som bilder. */
  /* Et område som er mindre enn noen få piksler i kartet, for eksempel et fredet tre, tegnes som en liten ring med fast størrelse.
     Som omriss ville det blinket når kartet flyttes: havner alle punktene i samme piksel, blir streken null lang og tegnes ikke. */
  const midt = f => f.midt || (f.midt = new Point(getCenter(f.getGeometry().getExtent())));
  /* Stilene lages første gang de trengs, når stilarket med fargene er lest inn. */
  const strek = () =>
    t.strek ||
    (t.strek = [
      new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,.92)', width: 6 }) }),
      new Style({ stroke: new Stroke({ color: farge(t.id), width: 2.75 }) })
    ]);
  const merke = () =>
    t.merke ||
    (t.merke = [
      new Style({
        geometry: midt,
        image: new Circle({ radius: 7, fill: new Fill({ color: 'rgba(255,255,255,.92)' }) })
      }),
      new Style({
        geometry: midt,
        image: new Circle({ radius: 4, stroke: new Stroke({ color: farge(t.id), width: 2.75 }) })
      })
    ]);
  t.lag = t.flate
    ? new TileLayer({ className: 'plan', visible: false, source: tegnetKilde(tile => tegnFlateflis(t, tile)) })
    : new VectorLayer({
        className: 'plan',
        source: t.kilde,
        visible: false,
        renderBuffer: 4000,
        style: (f, res) => {
          const u = f.getGeometry().getExtent();
          return Math.max(u[2] - u[0], u[3] - u[1]) < 8 * res ? merke() : strek();
        }
      });
  return t;
});
/* Fargeruten i raden: slår temaet av og på i kartet. */
export function byttNatur(t) {
  t.paa = !t.paa;
  if (!t.paa && app.vist && app.vist.t === t) fjernMerket();
  visNatur(t);
}
/* Valget om slør over det som ikke er kartlagt. */
export function settSlor(t, paa) {
  app.slorPaa = paa;
  visNatur(t);
}
/* Slør over det som ikke er kartlagt: flisene fylles med en lys farge, og de kartlagte flatene stanses ut. Fliser uten noe kartlagt
   deler ett og samme bilde, så laget koster lite der hele flisen er ukjent. Laget ligger under naturflatene og planlaget. */
const dekKilde = new VectorSource();
let heltSlor = null;
const slorFarge = () => `rgba(${rgb('slor').join(',')},.55)`;
function tegnSlorflis(tile) {
  const u = plannett.getTileCoordExtent(tile.getTileCoord()),
    fl = dekKilde.getFeaturesInExtent(u);
  if (!fl.length) {
    if (!heltSlor) {
      heltSlor = lerret();
      const g = heltSlor.getContext('2d');
      g.fillStyle = slorFarge();
      g.fillRect(0, 0, 512, 512);
    }
    tile.setImage(heltSlor);
    return;
  }
  const t0 = performance.now(),
    c = lerret(),
    g = c.getContext('2d'),
    s = 512 / (u[2] - u[0]);
  g.fillStyle = slorFarge();
  g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  for (const f of fl) {
    kommuneSti(g, f.getGeometry(), u, s);
    g.fill('evenodd');
  }
  tile.setImage(c);
  tidSlutt('slør, fliser', t0);
}
export const dekLag = new TileLayer({ className: 'plan', visible: false, source: tegnetKilde(tegnSlorflis) });
function settDekning(t) {
  /* de kartlagte flatene for valgt kommune inn i sløret */
  const E = t.data && t.data.ekstra;
  dekKilde.clear();
  if (E && E.f) dekKilde.addFeatures(E.f);
  friskOpp(dekLag);
}
/* Rekkefølge i kartet: fylte flater ligger under planlaget, så planlagt utbygging oppå verdifull natur synes. Omriss ligger øverst. */
export const flateLag = NATURLAG.filter(t => t.flate).map(t => t.lag),
  omrissLag = NATURLAG.filter(t => !t.flate).map(t => t.lag);
function naturMaske(g, kommune) {
  /* området som et lite rutenett med dekning per rute. kommune oppgis bare hvis flaten ikke alt er klippet. */
  const e = kommune ? getIntersection(g.getExtent(), kommune.getExtent()) : g.getExtent();
  if (isEmpty(e)) return null;
  const res = Math.max(10, Math.max(e[2] - e[0], e[3] - e[1]) / 1500),
    w = Math.ceil((e[2] - e[0]) / res) + 1,
    h = Math.ceil((e[3] - e[1]) / res) + 1,
    u = [e[0], e[3] - h * res, e[0] + w * res, e[3]];
  const k = tegneflate(w, h);
  kommuneSti(k, g, u, 1 / res);
  k.fill('evenodd');
  if (kommune) {
    k.globalCompositeOperation = 'destination-in';
    kommuneSti(k, kommune, u, 1 / res);
    k.fill('evenodd');
  }
  const d = k.getImageData(0, 0, w, h).data,
    a = new Uint8Array(w * h);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    a[i] = d[4 * i + 3];
    sum += a[i];
  }
  return { u, res, w, h, a, km2: ((sum / 255) * res * res) / 1e6 };
}
/* Hver flate klippes mot kommunegrensen én gang, og resultatet huskes så lenge siden er åpen: navn, opplysninger, areal i kommunen,
   den klippede flaten og maskene. Velges kommunen igjen, trengs verken kall mot Miljødirektoratet eller ny utregning. */
function klippNatur(t, j, geom) {
  const kom = flater(geom),
    m2 = utm33(geom);
  return j.features
    .map(f => {
      const g = f.geometry;
      if (!g || !g.coordinates) return null;
      const hele = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
      let koord = null,
        uklippet = false,
        km2;
      try {
        koord = polygonClipping.intersection(hele, kom);
      } catch (e) {
        koord = null;
      }
      if (koord) {
        if (!koord.length) return null;
        km2 = new MultiPolygon(koord).getArea() / m2;
      } else {
        koord = hele;
        uklippet = true;
        const m = naturMaske(new MultiPolygon(hele), geom);
        if (!m || !(m.km2 > 0)) return null;
        km2 = m.km2;
      } /* klippingen feilet: flaten klippes i kartet i stedet */
      return km2 > 0 ? { koord, uklippet, km2, ...t.les(f.properties || {}) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.km2 - a.km2);
}
function tegnFlateflis(t, tile) {
  /* enkeltflatene som berører flisen, tegnet tett og så gjort litt gjennomsiktige samlet, så overlapp ikke blir mørkere */
  const t0 = performance.now(),
    u = plannett.getTileCoordExtent(tile.getTileCoord()),
    fl = t.kilde.getFeaturesInExtent(u);
  if (!fl.length) {
    tile.setState(TOM);
    return;
  }
  const c = lerret(),
    g = c.getContext('2d'),
    s = 512 / (u[2] - u[0]);
  g.fillStyle = g.strokeStyle = farge(t.id);
  g.lineWidth = 1;
  g.lineJoin = 'round';
  if (t.klasser)
    fl.sort(
      (a, b) => b.get('v') - a.get('v')
    ); /* lavest verdi først, så den høyeste ligger øverst der lokaliteter overlapper */
  for (const f of fl) {
    if (t.klasser) {
      const v = f.get('v');
      g.fillStyle = farge(t.klasser[v][1]);
      g.strokeStyle = farge(t.klasser[Math.max(0, v - 1)][1]);
    }
    kommuneSti(g, f.getGeometry(), u, s);
    g.fill('evenodd');
    g.stroke();
  }
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = 'rgba(0,0,0,.82)';
  g.fillRect(0, 0, 512, 512);
  tile.setImage(c);
  tidSlutt(t.navn.toLowerCase() + ', fliser', t0);
}
/* Mange små flater som overlapper: arealet finnes ved å tegne dem i et rutenett over kommunen og summere dekningen i rutene.
   Én tegning per verdikategori, der alle flater med minst den verdien tegnes som én sammenhengende form og klippes mot kommunen.
   Forskjellen mellom tegningene gir arealet per kategori uten dobbeltelling: der lokaliteter overlapper, teller den høyeste verdien,
   slik kartet også viser det. Dette er mye raskere enn å slå sammen tusen flater geometrisk, som låste siden i opptil et sekund.
   Enkeltflatene beholdes for navn, liste og kryssing med planlagt utbygging. */
function klasseAreal(omrader, antall, geom, innenfor) {
  /* innenfor: en flate arealet også skal klippes mot, for eksempel det kartlagte */
  const m2 = utm33(geom),
    { res, w, h, u } = rutenett(geom.getExtent(), 1536, 10);
  const g = tegneflate(w, h),
    kum = [];
  const med = ring => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return a > 0;
  }; /* omløpsretning */
  for (let v = 0; v < antall && omrader.length; v++) {
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.beginPath();
    for (const o of omrader) {
      if ((o.v || 0) > v) continue;
      for (const flate of o.koord)
        flate.forEach((ring, nr) => {
          /* ytterkanter én vei og hull motsatt vei, så overlapp fylles og hull blir hull */
          const snu = med(ring) !== (nr === 0),
            n = ring.length;
          for (let i = 0; i < n; i++) {
            const q = ring[snu ? n - 1 - i : i],
              x = (q[0] - u[0]) / res,
              y = (u[3] - q[1]) / res;
            if (i) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.closePath();
        });
    }
    g.fill('nonzero');
    g.globalCompositeOperation = 'destination-in';
    kommuneSti(g, geom, u, 1 / res);
    g.fill('evenodd');
    if (innenfor) {
      kommuneSti(g, innenfor, u, 1 / res);
      g.fill('evenodd');
    }
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 3; i < d.length; i += 4) sum += d[i];
    kum.push(((sum / 255) * res * res) / m2);
  }
  return {
    klasser: Array.from({ length: antall }, (_, v) => Math.max(0, (kum[v] || 0) - (v ? kum[v - 1] || 0 : 0))),
    sum: kum.length ? kum[kum.length - 1] : 0
  };
}
function samleNatur(t, j, geom) {
  const m2 = utm33(geom),
    areal = k => (k && k.length ? new MultiPolygon(k).getArea() / m2 : 0);
  const omrader = j.features
    .filter(f => f.geometry && f.geometry.coordinates)
    .map(f => {
      const koord = flerflate(f.geometry);
      return { koord, uklippet: false, km2: areal(koord), ...t.les(f.properties || {}) };
    })
    .sort(
      (a, b) => (a.v || 0) - (b.v || 0) || b.km2 - a.km2
    ); /* høyest verdi først, så en planrute der lokaliteter overlapper regnes til den høyeste */
  const r = klasseAreal(omrader, t.klasser ? t.klasser.length : 1, geom);
  return { omrader, klasser: t.klasser ? r.klasser : null, sum: r.sum };
}
/* Kartleggingsgrad: hvor stor del av kommunen som er kartlagt etter Miljødirektoratets instruks. Uten den er «ingen registrert» lett å misforstå. */
async function hentDekning(k, geom) {
  const j = await hent(
    'Miljødirektoratet',
    `Kartlagt område i ${k.navn}`,
    MD +
      'naturtyper_nin/MapServer/1/query?' +
      new URLSearchParams({
        where: '1=1',
        geometry: geom
          .getExtent()
          .map(v => Math.round(v))
          .join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: 25833,
        outSR: 25833,
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'Årstall',
        maxAllowableOffset: 10,
        geometryPrecision: 0,
        f: 'geojson'
      })
  );
  const fl = (j.features || []).filter(f => f.geometry && f.geometry.coordinates);
  if (!fl.length) return { km2: 0 };
  const kom = flater(geom),
    u = polygonClipping.intersection(polygonClipping.union(...fl.map(f => flerflate(f.geometry))), kom);
  const aar = fl.map(f => parseInt((f.properties || {})['Årstall'], 10)).filter(v => v > 1900);
  return {
    km2: u.length ? new MultiPolygon(u).getArea() / utm33(geom) : 0,
    fra: aar.length ? Math.min(...aar) : null,
    til: aar.length ? Math.max(...aar) : null,
    flate: u,
    f: u.map(p => new Feature(new Polygon(p))),
    maske: null
  };
}
export async function hentNatur(t, k, geom, mitt) {
  t.data = null;
  t.kilde.clear();
  if (t.flate) friskOpp(t.lag);
  if (t.dekning) settDekning(t);
  visNatur(t);
  try {
    let pakke = t.minne.get(k.nr);
    if (!pakke) {
      const j = await hent(
        'Miljødirektoratet',
        `${t.navn} i ${k.navn}`,
        t.url +
          '?' +
          new URLSearchParams({
            where: t.hvor ? t.hvor(k.nr) : `kommune LIKE '%(${k.nr})%'`,
            outFields: t.felt,
            outSR: 25833,
            maxAllowableOffset: t.slakk,
            geometryPrecision: 0,
            f: 'geojson'
          })
      );
      if (mitt !== M.valgNr) return;
      if (!j || !Array.isArray(j.features)) throw new Error('uventet svar');
      const med = o => {
        const g = new MultiPolygon(o.koord);
        return {
          ...o,
          f: new Feature({ geometry: g, navn: o.navn, v: o.v || 0 }),
          ext: g.getExtent(),
          maske: null,
          plan: 0,
          smal: 0
        };
      };
      if (t.samlet) {
        const r = samleNatur(t, j, geom),
          omrader = r.omrader.map(med);
        pakke = {
          omrader,
          sum: r.sum,
          klasser: r.klasser,
          vis: omrader.map(o => o.f),
          ufullstendig: !!j.exceededTransferLimit
        };
      } else {
        const omrader = klippNatur(t, j, geom).map(med);
        pakke = { omrader, sum: omrader.reduce((s, o) => s + o.km2, 0), vis: omrader.map(o => o.f) };
      }
      husk(t.minne, k.nr, pakke, 30);
    }
    t.data = { nr: k.nr, ...pakke, pakke };
    t.kilde.addFeatures(pakke.vis);
    if (t.flate) friskOpp(t.lag);
    if (t.dekning) settDekning(t);
    if (t.ekstra && pakke.ekstra === undefined) {
      pakke.ekstra = null;
      t.ekstra(k, geom)
        .then(v => {
          if (t.klasser && v && v.flate && v.flate.length)
            try {
              v.inne = klasseAreal(pakke.omrader, t.klasser.length, geom, new MultiPolygon(v.flate)).klasser;
            } catch (e) {}
          pakke.ekstra = v;
          if (t.data && t.data.pakke === pakke) {
            t.data.ekstra = v;
            if (t.dekning) settDekning(t);
            regnNatur(t);
          }
        })
        .catch(() => {});
    }
  } catch (e) {
    if (mitt !== M.valgNr) return;
    t.data = { nr: k.nr, feil: true, omrader: [], sum: 0 };
  }
  regnNatur(t);
}
/* Påvirkning: hver rute med planlagt utbygging (21 meter) slås opp i maskene. Ruter i smale striper telles for seg. */
function kryssNatur(D, R, nK, medDekning, kommune) {
  /* D: områdene i temaet. R: rutenettet for planen. nK: antall verdiklasser. kommune: flaten uklippede områder klippes mot.
     Ren regning: gir tallene tilbake. Det eneste den endrer, er maskene, som lages første gang de trengs og huskes. */
  const B = R.basis || null,
    nE = R.eget ? R.antallEgne : 0,
    O = D.omrader;
  const tom = () => ({ alt: new Int32Array(nK), eg: Array.from({ length: nE }, () => new Int32Array(nK)) }),
    S = tom(),
    P = tom(); /* S: med egne områder. P: kommuneplanen alene. */
  const plan = new Int32Array(O.length),
    smal = new Int32Array(O.length);
  const m = OPPLOSNINGER[R.z] / 2,
    X = i => ORIGO[0] + (R.cx0 + (i % R.w) + 0.5) * m,
    Y = i => ORIGO[1] - (R.cy0 + Math.floor(i / R.w) + 0.5) * m,
    fjernet = i => B.ryddet[i] && R.alle[i] !== 1 && R.alle[i] !== 2; /* i planen, tatt ut av et eget område */
  if (O.length) {
    const treff = i => {
      /* nummeret til området ruta ligger i, eller -1 */
      const x = X(i),
        y = Y(i);
      for (let a = 0; a < O.length; a++) {
        const o = O[a];
        if (x < o.ext[0] || x > o.ext[2] || y < o.ext[1] || y > o.ext[3]) continue;
        const Mk = o.maske || (o.maske = naturMaske(o.f.getGeometry(), o.uklippet ? kommune : null));
        if (!Mk) continue; /* masken lages først når en planrute ligger i nærheten */
        const px = Math.floor((x - Mk.u[0]) / Mk.res),
          py = Math.floor((Mk.u[3] - y) / Mk.res);
        if (px < 0 || py < 0 || px >= Mk.w || py >= Mk.h || Mk.a[py * Mk.w + px] < 128) continue;
        return a;
      }
      return -1;
    };
    for (const i of R.celler) {
      const a = treff(i);
      if (a < 0) continue;
      const v = O[a].v || 0,
        e = nE ? R.eget[i] : 0;
      if (R.ryddet[i]) {
        plan[a]++;
        S.alt[v]++;
        if (e) S.eg[e - 1][v]++;
      } else smal[a]++;
      if (B && B.ryddet[i]) {
        P.alt[v]++;
        if (e) P.eg[e - 1][v]++;
      }
    }
    if (B)
      for (const i of B.celler) {
        if (!fjernet(i)) continue;
        const a = treff(i);
        if (a < 0) continue;
        const v = O[a].v || 0,
          e = R.eget[i];
        P.alt[v]++;
        if (e) P.eg[e - 1][v]++;
      }
  }
  let gap = null;
  if (medDekning && D.ekstra) {
    /* ruter med planlagt utbygging på natur, uten smale striper, delt på kartlagt og ikke kartlagt */
    const E = D.ekstra,
      Mk = E.flate && E.flate.length ? E.maske || (E.maske = naturMaske(new MultiPolygon(E.flate), null)) : null;
    const ukjentRute = i => {
      if (!Mk) return true;
      const px = Math.floor((X(i) - Mk.u[0]) / Mk.res),
        py = Math.floor((Mk.u[3] - Y(i)) / Mk.res);
      return px < 0 || py < 0 || px >= Mk.w || py >= Mk.h || Mk.a[py * Mk.w + px] < 128;
    };
    const ny = () => ({ nat: 0, ukjent: 0, eg: Array.from({ length: nE }, () => ({ nat: 0, ukjent: 0 })) }),
      G = ny(),
      GP = ny();
    const tell = (T, i, uk) => {
      const e = nE ? R.eget[i] : 0;
      T.nat++;
      if (uk) T.ukjent++;
      if (e) {
        T.eg[e - 1].nat++;
        if (uk) T.eg[e - 1].ukjent++;
      }
    };
    for (const i of R.celler) {
      const s = R.ryddet[i] === 1,
        b = !!B && B.ryddet[i] === 1;
      if (!s && !b) continue;
      const uk = ukjentRute(i);
      if (s) tell(G, i, uk);
      if (b) tell(GP, i, uk);
    }
    if (B) for (const i of B.celler) if (B.ryddet[i] === 1 && fjernet(i)) tell(GP, i, ukjentRute(i));
    gap = { nat: G.nat, ukjent: G.ukjent, eg: G.eg, plan: B ? GP : null };
  }
  return { kryss: { S, P: B ? P : null }, gap, plan, smal };
}
export function regnNatur(t) {
  /* samordner: krysser temaet med planen hvis den er regnet ut, legger tallene i temaets data og ber om ny tegning */
  const D = t.data;
  if (!D || !app.valgt || D.nr !== app.valgt.nr) return visNatur(t);
  const R = app.planRaster && app.planRaster.nr === app.valgt.nr && !utenPlan() ? app.planRaster : null,
    t0 = performance.now();
  const r = R ? kryssNatur(D, R, t.klasser ? t.klasser.length : 1, !!t.dekning, app.klipp) : null;
  D.omrader.forEach((o, a) => {
    o.plan = r ? r.plan[a] : 0;
    o.smal = r ? r.smal[a] : 0;
  });
  D.regnet = !!R;
  D.kryss = r ? r.kryss : null;
  D.gap = r ? r.gap : null;
  visNatur(t);
  tidSlutt(t.navn.toLowerCase(), t0);
}
/* Tallene som vises for et naturtema, regnet ut fra områdene. D er temaets data, klasser verdiklassene hvis temaet har det,
   medDekning om temaet har kartleggingsgrad, samlet om bare berørte områder skal listes, og land landarealet i km². Ren regning. */
export function byggNaturTall(D, klasser, medDekning, samlet, land) {
  const o = D.omrader,
    E = D.ekstra;
  /* per verdiklasse: antall lokaliteter og ruter med planlagt utbygging */
  const perKlasse =
    klasser && D.klasser && o.length
      ? klasser.map((_, v) => {
          const av = o.filter(x => x.v === v);
          return { antall: av.length, plan: av.reduce((s, x) => s + x.plan, 0) };
        })
      : null;
  /* Helhetsbildet: landarealet L delt i kartlagt K og ikke kartlagt U, og verdsatt natur per verdi innenfor og utenfor det kartlagte. */
  let helhet = null;
  if (medDekning && E && E.km2 > 0 && E.inne && D.klasser && land > 0 && o.length > 0) {
    const L = land,
      K = Math.min(E.km2, L),
      U = Math.max(0, L - K),
      inne = E.inne,
      ute = D.klasser.map((a, v) => Math.max(0, a - inne[v]));
    helhet = { L, K, U, inne, ute, si: inne.reduce((a, b) => a + b, 0), su: ute.reduce((a, b) => a + b, 0) };
  }
  return {
    klasser: perKlasse,
    helhet,
    plan: o.reduce((s, x) => s + x.plan, 0),
    smal: o.reduce((s, x) => s + x.smal, 0),
    berort: o.filter(x => x.plan)
      .length /* ruter med planlagt utbygging, ruter i smale striper og antall områder som berøres */,
    vises: samlet
      ? o.filter(x => x.plan).sort((a, b) => b.plan - a.plan)
      : o /* av mange små lokaliteter listes bare de som berøres */
  };
}
/* Kartlagene for et tema følger valget og om det finnes noe å vise. Teksten tegnes av komponentene. */
export function visNatur(t) {
  const D = t.data,
    ok = !!D && !!app.valgt && D.nr === app.valgt.nr,
    o = ok ? D.omrader : [];
  t.lag.setVisible(t.paa && !!app.klipp && ok && o.length > 0);
  if (t.dekning) {
    const kartlagt = ok && !!D.ekstra && D.ekstra.km2 > 0;
    dekLag.setVisible(t.paa && app.slorPaa && !!app.klipp && kartlagt);
  }
  endret();
}
/* Ett område valgt fra en liste: kartet flyttes dit, området får en tydelig ramme, og en liten merkelapp i kartet sier hva som vises
   og gir veien tilbake til listen. Markeringen står til et annet område velges, temaet slås av eller kommunen byttes. */
const markKilde = new VectorSource();

const markStrek = [
  new Style({ stroke: new Stroke({ color: '#fff', width: 8 }) }),
  new Style({ stroke: new Stroke({ color: '#171C1A', width: 3.5 }) })
];
const markMidt = f => new Point(getCenter(f.getGeometry().getExtent()));
const markRing = [
  new Style({
    geometry: markMidt,
    image: new Circle({ radius: 13, stroke: new Stroke({ color: '#fff', width: 8 }) })
  }),
  new Style({
    geometry: markMidt,
    image: new Circle({ radius: 13, stroke: new Stroke({ color: '#171C1A', width: 3.5 }) })
  })
];
export const markLag = new VectorLayer({
  className: 'merket',
  source: markKilde,
  style: (f, res) => {
    const u = f.getGeometry().getExtent();
    return Math.max(u[2] - u[0], u[3] - u[1]) < 16 * res ? markRing : markStrek;
  }
});
export function fjernMerket() {
  markKilde.clear();
  app.vist = null;
  endret();
}
export function visIKartet(t, o, liId) {
  if (!t.paa) {
    t.paa = true;
    visNatur(t);
  }
  markKilde.clear();
  markKilde.addFeature(new Feature(o.f.getGeometry()));
  app.vist = { t, liId, navn: o.navn };
  endret();
  view.fit(o.ext, { padding: [56, 56, 96, 56], minResolution: OPPLOSNINGER[13], duration: rolig() ? 0 : 400 });
  tilKartet(true);
}
