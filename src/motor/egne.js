/* Egne områder: tegning i kartet, opplasting av plan, og radene som sammenligner med kommuneplanen. */
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Feature from 'ol/Feature';
import Draw from 'ol/interaction/Draw';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke, Fill, Circle, Text } from 'ol/style';
import { get as hentProjeksjon, transform } from 'ol/proj';
import { intersects, createEmpty, extend, getCenter, getIntersection } from 'ol/extent';
import { UTM, ORIGO, OPPLOSNINGER, app, endret, nf, utm33, finn, tilKartet } from './felles.js';
import { lerret, kommuneSti } from './nett.js';
import { ingenPlan, visPlan } from './plan.js';
import { NATURLAG } from './naturtema.js';
import { kart, view, lukkBytt } from './kart.js';
import { velg } from './start.js';

/* Egne områder ligger i app.egne. De finnes bare så lenge siden er åpen, og hører til kommunen de ble tegnet i. */
let egenTeller = 0;
export const mine = () => (app.valgt ? app.egne.filter(g => g.nr === app.valgt.nr) : []);
export const utenPlan = () =>
  ingenPlan() &&
  !mine().length; /* uten kommuneplan og uten egne områder finnes det ingen planlagt utbygging å regne på */
/* Egne områder i kartet: omriss med nummer. Fargen inni kommer fra planlaget, som viser hva som går med. */
const egneKilde = new VectorSource();
export const egneLag = new VectorLayer({
  className: 'merket',
  source: egneKilde,
  style: f => [
    new Style({ stroke: new Stroke({ color: '#fff', width: 7 }) }),
    new Style({
      stroke: new Stroke({
        color: '#1D4ED8',
        width: 3,
        lineDash: f.get('type') === 'fri' ? [10, 7] : undefined
      }),
      text: new Text({
        text: String(f.get('lopenr')),
        font: '600 14px sans-serif',
        fill: new Fill({ color: '#fff' }),
        backgroundFill: new Fill({ color: '#1D4ED8' }),
        padding: [3, 6, 2, 6],
        overflow: true
      })
    })
  ]
});
let tegn = null;
export const tegner = () => !!tegn;
const tegnStil = [
  new Style({ stroke: new Stroke({ color: '#fff', width: 6 }) }),
  new Style({
    stroke: new Stroke({ color: '#1D4ED8', width: 2.5 }),
    fill: new Fill({ color: 'rgba(29,78,216,.12)' }),
    image: new Circle({
      radius: 7,
      fill: new Fill({ color: '#1D4ED8' }),
      stroke: new Stroke({ color: '#fff', width: 2.5 })
    })
  })
];
export function sluttTegning() {
  if (tegn) kart.removeInteraction(tegn);
  tegn = null;
  app.tegner = false;
  endret();
}
export function startTegning() {
  if (!app.valgt || !app.klipp || tegner()) return;
  lukkBytt();
  tegn = new Draw({ type: 'Polygon', stopClick: true, minPoints: 3, style: tegnStil });
  tegn.on('drawend', e => {
    const geom = e.feature.getGeometry();
    setTimeout(() => {
      sluttTegning();
      nyttEget(geom);
    }, 0);
  });
  kart.addInteraction(tegn);
  app.tegner = true;
  endret();
  tilKartet();
}
export const angrePunkt = () => tegn && tegn.removeLastPoint();
export const ferdigTegning = () => tegn && tegn.finishDrawing();
export function visEgneLag() {
  egneKilde.clear();
  egneKilde.addFeatures(
    mine()
      .filter(g => g.f)
      .map(g => g.f)
  );
}
function egneEndret() {
  visEgneLag();
  visPlan();
}
function nyttEget(geom) {
  if (!app.valgt) return;
  if (!(geom.getArea() > 400)) {
    app.egneStatus = 'Området ble for lite til å regnes ut. Tegn et større område.';
    endret();
    return;
  }
  app.egneStatus = '';
  const lopenr = mine().reduce((m, x) => Math.max(m, x.lopenr || 0), 0) + 1;
  const g = {
    id: ++egenTeller,
    nr: app.valgt.nr,
    lopenr,
    navn: `Eget område ${lopenr}`,
    kilde: 'tegnet',
    deler: [{ geom, type: 'bygg', ext: geom.getExtent() }],
    ext: geom.getExtent(),
    km2: geom.getArea() / utm33(geom),
    tall: null
  };
  g.f = new Feature({ geometry: geom, lopenr, type: 'bygg' });
  app.egne.push(g);
  egneEndret();
}
/* Valget mellom utbygging og ikke utbygging for et tegnet område. */
export function settType(g, type) {
  if (g.deler[0].type === type) return;
  g.deler[0].type = type;
  g.f.set('type', type);
  egneEndret();
}
export function slettEget(g) {
  app.egne.splice(app.egne.indexOf(g), 1);
  egneEndret();
}
export function visEgetIKartet(g) {
  view.fit(app.klipp ? getIntersection(g.ext, app.klipp.getExtent()) : g.ext, {
    padding: [56, 56, 56, 56],
    minResolution: OPPLOSNINGER[13],
    duration: 300
  });
  tilKartet();
}
/* Opplastet plan i samme GeoJSON-format som DiBKs nedlasting av plandata: flater med arealformål og arealbruksstatus.
   Bebyggelse, anlegg og samferdsel (arealformål i 1000- og 2000-serien) med status framtidig regnes som utbygging, slik som for
   kommuneplanen fra DiBK. Alle andre flater med arealformål regnes som ikke utbygging. Innenfor flatene erstatter filen kommuneplanen.
   Filen leses i nettleseren og sendes ingen steder. */
const siffer = v => {
  const m = /\d+/.exec(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return m ? m[0] : '';
};
const egenskap = (p, ...navn) => {
  for (const n of navn) {
    if (p[n] !== undefined && p[n] !== null) return p[n];
    const [a, b] = n.split('.');
    if (b && p[a] && p[a][b] !== undefined) return p[a][b];
  }
  return undefined;
};
function finnProjeksjon(j, punkt, mot) {
  /* oppgitt i filen, ellers gjettet: grader, eller den UTM-sonen som legger planen nærmest kommunen */
  const navn = j.crs && j.crs.properties ? String(j.crs.properties.name || '') : '',
    m = /EPSG:+(\d+)/.exec(navn);
  if (m && hentProjeksjon('EPSG:' + m[1])) return 'EPSG:' + m[1];
  if (/CRS84/.test(navn) || (Math.abs(punkt[0]) <= 180 && Math.abs(punkt[1]) <= 90)) return 'EPSG:4326';
  let best = UTM,
    min = Infinity;
  for (const kode of [UTM, 'EPSG:25832', 'EPSG:25835']) {
    const q = transform(punkt, kode, UTM),
      a = mot ? Math.hypot(q[0] - mot[0], q[1] - mot[1]) : 0;
    if (a < min) {
      min = a;
      best = kode;
    }
  }
  return best;
}
/* Tolker innholdet i en planfil. valgtNr er kommunen som er valgt nå, erKommune sier om et nummer er en kommune, og midtAv gir et
   punkt midt i en kommune, brukt til å gjette projeksjonen. Gir { feil } med en melding, eller flatene og opplysningene om planen.
   Ren regning: endrer ingenting. */
function lesPlanfil(j, valgtNr, erKommune, midtAv) {
  const alle = (j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : j.features) || [];
  const polygoner = alle.filter(
    f =>
      f &&
      f.geometry &&
      (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
      f.geometry.coordinates &&
      f.geometry.coordinates.length
  );
  if (!polygoner.length)
    return {
      feil: 'Fant ingen flater i filen. Den må være GeoJSON med polygoner, som filen fra DiBKs nedlasting av plandata.'
    };
  const medFormal = polygoner.filter(
      f => siffer(egenskap(f.properties || {}, 'arealformål', 'arealformal', 'arealformaal', 'Arealformål')) !== ''
    ),
    bruk = medFormal.length ? medFormal : polygoner;
  const knr = siffer(
      bruk
        .map(f => egenskap(f.properties || {}, 'arealplanId.kommunenummer', 'kommunenummer'))
        .find(v => v !== undefined)
    ).padStart(4, '0'),
    funnet = /^\d{4}$/.test(knr) && knr !== '0000' && erKommune(knr),
    nr = funnet ? knr : valgtNr;
  if (!nr) return { feil: 'Velg en kommune først.' };
  const g0 = bruk[0].geometry,
    punkt = g0.type === 'Polygon' ? g0.coordinates[0][0] : g0.coordinates[0][0][0];
  const proj = finnProjeksjon(j, punkt, midtAv(nr)),
    les = new GeoJSON(),
    deler = [];
  let bygg = 0,
    km2 = 0,
    ext = createEmpty();
  for (const f of bruk) {
    let geom;
    try {
      geom = les.readGeometry(f.geometry, { dataProjection: proj, featureProjection: UTM });
    } catch (e) {
      continue;
    }
    const p = f.properties || {},
      formal = siffer(egenskap(p, 'arealformål', 'arealformal', 'arealformaal', 'Arealformål')),
      status = siffer(egenskap(p, 'arealbruksstatus', 'arealbrukstatus', 'Arealbruksstatus'));
    const type = !medFormal.length || (/^[12]/.test(formal) && (status === '' || status === '2')) ? 'bygg' : 'fri';
    if (type === 'bygg') bygg++;
    const e = geom.getExtent();
    extend(ext, e);
    km2 += geom.getArea() / utm33(geom);
    deler.push({ geom, type, ext: e });
  }
  if (!deler.length) return { feil: 'Flatene i filen kunne ikke leses.' };
  const planid = String(
    bruk
      .map(f => egenskap(f.properties || {}, 'arealplanId.planidentifikasjon', 'planidentifikasjon'))
      .find(v => v !== undefined) || ''
  );
  return { nr, funnet, deler, ext, km2, planid, bygg, annet: deler.length - bygg, utenFormal: !medFormal.length, proj };
}
export async function lastOppPlan(fil) {
  const melding = t => {
    app.egneStatus = t;
    endret();
  };
  try {
    if (!fil) return;
    if (fil.size > 120e6) return melding('Filen er for stor til å leses i nettleseren (over 120 MB).');
    melding(`Leser ${fil.name} …`);
    await new Promise(ok => setTimeout(ok, 30));
    const midtAv = nr => {
      const k = finn(nr)[1];
      return app.valgt && app.valgt.nr === nr && app.klipp
        ? getCenter(app.klipp.getExtent())
        : k.boks
          ? transform([(k.boks[0] + k.boks[2]) / 2, (k.boks[1] + k.boks[3]) / 2], 'EPSG:4326', UTM)
          : null;
    };
    const P = lesPlanfil(JSON.parse(await fil.text()), app.valgt ? app.valgt.nr : null, nr => !!finn(nr), midtAv);
    if (P.feil) return melding(P.feil);
    const { nr, funnet, ...plan } = P,
      k = finn(nr)[1];
    app.egne.push({
      id: ++egenTeller,
      nr,
      navn: fil.name.replace(/\.(geo)?json$/i, ''),
      kilde: 'fil',
      tall: null,
      ...plan
    });
    melding(
      `${fil.name}: ${nf(plan.deler.length, 0)} flater lest${funnet && (!app.valgt || app.valgt.nr !== nr) ? `, og kommunen er byttet til ${k.navn}` : ''}.`
    );
    if (!app.valgt || app.valgt.nr !== nr) velg(nr);
    else egneEndret();
  } catch (e) {
    melding('Filen kunne ikke leses som GeoJSON.');
  }
}
/* Resultatet for egne områder, etter samme mal som for kommuneplanen: natur og jordbruk som går med, og hvor mye av det som ligger
   i verneområder, villreinområder, verdsatt natur per verdi og natur som ikke er kartlagt. Hver rad viser kommuneplanen alene,
   tallet med egne områder og endringen mellom dem. Natur og jordbruk vises også som andel av det som finnes i kommunen i dag. */
/* Radene i sammenligningen mellom kommuneplanen og egne områder. e er null for hele kommunen, ellers nummeret til området, og T er
   tallene for det området. R er rutenettet, GK kryssingen med grått areal, tema temaene som er krysset med planen ({ navn, id,
   klasser, kryss }) og gap utbygging på natur som ikke er kartlagt. Hver rad er navn, farge, planen alene, med egne områder,
   hva andelen regnes av, og gruppe. Ren regning. */
function byggEgneRader(e, T, R, harPlan, GK, tema, gap) {
  const ut = [];
  ut.push([
    'Natur',
    'pnat',
    harPlan ? (T ? T.fnat : R.basis.rn) : null,
    T ? T.nnat : R.sum.rn,
    e === null ? R.iDag.nat : 0,
    ''
  ]);
  ut.push([
    'Jordbruk',
    'pjor',
    harPlan ? (T ? T.fjor : R.basis.rj) : null,
    T ? T.njor : R.sum.rj,
    e === null ? R.iDag.jor : 0,
    ''
  ]);
  if (GK) {
    const x = X => (e === null ? X : X.eg[e] || { graa: 0, gron: 0, gront: 0 });
    ut.push(['Grått areal', 'graa2', harPlan ? x(GK.P).graa : null, x(GK.S).graa, 0, '']);
    ut.push(['– minst halvt grønt', '', harPlan ? x(GK.P).gron : null, x(GK.S).gron, 0, '']);
    ut.push(['Grønt i bebygd', 'gront', harPlan ? x(GK.P).gront : null, x(GK.S).gront, 0, '']);
  }
  const verdi = [],
    ruter = (X, v) => (e === null ? X.alt[v] : X.eg[e] ? X.eg[e][v] : 0);
  for (const t of tema) {
    const K = t.kryss;
    if (t.klasser)
      t.klasser.forEach(([navn, id], v) =>
        verdi.push([navn, id, harPlan ? ruter(K.P, v) : null, ruter(K.S, v), 0, 'Av dette i verdsatt natur'])
      );
    else ut.push([t.navn, t.id, harPlan ? ruter(K.P, 0) : null, ruter(K.S, 0), 0, 'Av dette i']);
  }
  if (gap && gap.plan)
    ut.push([
      'Ikke kartlagt natur',
      '',
      harPlan ? (e === null ? gap.plan.ukjent : gap.plan.eg[e] ? gap.plan.eg[e].ukjent : 0) : null,
      e === null ? gap.ukjent : gap.eg[e] ? gap.eg[e].ukjent : 0,
      0,
      'Av dette i'
    ]);
  return ut.concat(verdi);
}
export function egneRader(e) {
  /* finner det radene bygges av i tilstanden. e: null for hele kommunen, ellers nummeret i listen over egne områder */
  const R = app.planRaster,
    GK =
      app.graaKryss && app.valgt && app.graaKryss.nr === app.valgt.nr && app.graaKryss.antallEgne === R.antallEgne
        ? app.graaKryss
        : null;
  const data = t => (t.data && app.valgt && t.data.nr === app.valgt.nr ? t.data : null);
  const tema = NATURLAG.filter(t => {
    const D = data(t);
    return D && D.kryss && D.kryss.P && D.omrader.length;
  }).map(t => ({
    navn: t.navn === 'Villrein' ? 'Villreinområder' : t.navn,
    id: t.id,
    klasser: t.klasser,
    kryss: t.data.kryss
  }));
  const V = NATURLAG.find(t => t.dekning),
    DV = V ? data(V) : null;
  return byggEgneRader(e, e === null ? null : mine()[e].tall, R, !ingenPlan(), GK, tema, DV ? DV.gap : null);
}
export function egenMaske(u) {
  const deler = [];
  for (const x of mine())
    if (intersects(x.ext, u)) for (const del of x.deler) if (intersects(del.ext, u)) deler.push(del);
  if (!deler.length) return null;
  const c = lerret(),
    g = c.getContext('2d', { willReadFrequently: true }),
    s = 512 / (u[2] - u[0]);
  for (const type of ['fri', 'bygg']) {
    g.fillStyle = type === 'bygg' ? '#f00' : '#0f0';
    for (const del of deler)
      if (del.type === type) {
        kommuneSti(g, del.geom, u, s);
        g.fill('evenodd');
      }
  }
  const a = g.getImageData(0, 0, 512, 512).data,
    ut = new Uint8Array(262144);
  for (let i = 0, q = 0; i < a.length; i += 4, q++) if (a[i + 3] >= 128) ut[q] = a[i] > a[i + 1] ? 1 : 2;
  return ut;
}
export function leggInnEget(g, merke, d, kl, eget, G) {
  /* et eget område eller en opplastet plan inn i rutenettet: rutene med midtpunkt i flatene */
  const u = g.ext,
    m = G.m,
    X0 = Math.max(0, Math.floor((u[0] - ORIGO[0]) / m) - G.cx0),
    X1 = Math.min(G.w - 1, Math.floor((u[2] - ORIGO[0]) / m) - G.cx0),
    Y0 = Math.max(0, Math.floor((ORIGO[1] - u[3]) / m) - G.cy0),
    Y1 = Math.min(G.h - 1, Math.floor((ORIGO[1] - u[1]) / m) - G.cy0);
  if (X1 < X0 || Y1 < Y0) return;
  const B = 1024,
    c = document.createElement('canvas'),
    k = c.getContext('2d', { willReadFrequently: true });
  for (let y0 = Y0; y0 <= Y1; y0 += B)
    for (let x0 = X0; x0 <= X1; x0 += B) {
      const cw = Math.min(B, X1 - x0 + 1),
        ch = Math.min(B, Y1 - y0 + 1),
        vx = ORIGO[0] + (G.cx0 + x0) * m,
        oy = ORIGO[1] - (G.cy0 + y0) * m,
        bit = [vx, oy - ch * m, vx + cw * m, oy];
      const deler = g.deler.filter(del => intersects(del.ext, bit));
      if (!deler.length) continue;
      c.width = cw;
      c.height = ch;
      for (const type of ['fri', 'bygg']) {
        k.fillStyle = type === 'bygg' ? '#f00' : '#0f0';
        for (const del of deler)
          if (del.type === type) {
            kommuneSti(k, del.geom, bit, 1 / m);
            k.fill('evenodd');
          }
      } /* utbygging tegnes sist og vinner der flater overlapper */
      const a = k.getImageData(0, 0, cw, ch).data;
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const q = 4 * (y * cw + x);
          if (a[q + 3] < 128) continue;
          const i = (y0 + y) * G.w + x0 + x,
            kls = kl[i];
          eget[i] = merke;
          G.type[i] = a[q] > a[q + 1] ? 1 : 2;
          if (a[q] > a[q + 1]) {
            if (kls === 3) d[i] = 1;
            else if (kls === 2) d[i] = 2;
          } else if (d[i] === 1 || d[i] === 2) d[i] = 0;
        }
    }
}
