/* Planlagt utbygging: kommuneplanen fra DiBK som kartlag, rutenettet for hele kommunen og arealtallene. */
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import {
  UTM,
  OPPLOSNINGER,
  SVAKEST,
  JOR,
  NAT,
  KL,
  M,
  app,
  endret,
  rgb,
  hent,
  gjeldende,
  rutenett,
  tegneflate,
  tidSlutt
} from './felles.js';
import { plannett, lerret, TOM, kommuneSti, friskOpp } from './nett.js';
import { klasseAv } from './farger.js';
import { dagensKlasser, hentPlan, fargeleggFliser } from './fliser.js';
import { tegnOversikt } from './oversikt.js';
import { egenMaske, mine, utenPlan, leggInnEget } from './egne.js';
import { NATURLAG, regnNatur } from './naturtema.js';
import { regnGraa } from './graa.js';

/* Kommuneplanen fra DiBK: områder satt av til framtidig bebyggelse, anlegg og samferdsel (arealformål 1000- og 2000-serien
   med arealbruksstatus 2), hentet som fliser i samme rutenett. For hver flis legges planen oppå dagens klasser i nettleseren,
   og bare natur og jordbruk som ligger i slike områder, tegnes. Zoomet ut brukes oversiktsbildet som dagens klasser:
   det lagrede, eller det nettleseren selv har satt sammen av flisene den har hentet. */
const PLAN = 'https://nap.ft.dibk.no/services/wms/kommuneplaner/';
const planSom = v =>
  `<PropertyIsLike wildCard="*" singleChar="?" escapeChar="!"><PropertyName>arealformål</PropertyName><Literal>${v}</Literal></PropertyIsLike>`;
const PLANFILTER = `<Filter xmlns="http://www.opengis.net/ogc"><And><PropertyIsEqualTo><PropertyName>arealbruksstatus</PropertyName><Literal>2</Literal></PropertyIsEqualTo><Or>${planSom('1*')}${planSom('2*')}</Or></And></Filter>`;
/* Flatene hentes med en egen stil som bare fyller dem, uten kantstrek. DiBKs standardstil tegner en strek rundt hver flate, og den
   er like bred i piksler uansett målestokk. Med ruter på 21 meter la streken rundt en fjerdedel til arealet i et testområde. */
const PLANSTIL =
  '<?xml version="1.0" encoding="UTF-8"?><StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld"><NamedLayer><Name>kparealformalomrade</Name><UserStyle><FeatureTypeStyle><Rule><PolygonSymbolizer><Fill><CssParameter name="fill">#000000</CssParameter></Fill></PolygonSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>';
const planUrl = tc =>
  PLAN +
  '?' +
  new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: 'kparealformalomrade',
    sld_body: PLANSTIL,
    crs: UTM,
    bbox: plannett
      .getTileCoordExtent(tc)
      .map(v => v.toFixed(2))
      .join(','),
    width: 512,
    height: 512,
    format: 'image/png8',
    transparent: 'true',
    filter: PLANFILTER
  });

/* Zoomet ut er mange planfelt mindre enn en skjermpiksel. Flisene på nivå 9 og grovere tegnes derfor fra et rutenett
   for hele kommunen (21 meter per rute, laget av arealutregningen). En flispiksel får farge bare hvis det faktisk ligger
   planlagt utbygging innenfor den, og styrken følger hvor stor del av pikselen det gjelder. Feltene blir dermed aldri
   større enn de er, og de forsvinner heller ikke: små felt vises som svake enkeltpiksler. */

function grovPlanFlis(tc) {
  const R = app.planRaster;
  if (!R) return null;
  const [z, x, y] = tc,
    f = 2 ** (R.z - z),
    D = app.visSmale ? R.alle : R.ryddet,
    F = [rgb('pnat'), rgb('pjor')];
  const c = lerret(),
    g = c.getContext('2d'),
    ut = g.createImageData(512, 512),
    o = ut.data;
  let tegnet = false;
  for (let py = 0; py < 512; py++) {
    const Y = (y * 512 + py) * f - R.cy0;
    if (Y + f <= 0 || Y >= R.h) continue;
    for (let px = 0; px < 512; px++) {
      const X = (x * 512 + px) * f - R.cx0;
      if (X + f <= 0 || X >= R.w) continue;
      let a = 0,
        b = 0;
      for (let j = Math.max(0, Y), jm = Math.min(R.h, Y + f); j < jm; j++)
        for (let i = Math.max(0, X), im = Math.min(R.w, X + f), rad = j * R.w; i < im; i++) {
          const v = D[rad + i];
          if (v === 1) a++;
          else if (v === 2) b++;
        }
      if (!a && !b) continue;
      tegnet = true;
      const q = F[b > a ? 1 : 0],
        i = 4 * (py * 512 + px),
        andel = (a + b) / (f * f);
      o[i] = q[0];
      o[i + 1] = q[1];
      o[i + 2] = q[2];
      o[i + 3] = Math.round(255 * Math.max(SVAKEST, Math.sqrt(andel)));
    }
  }
  g.putImageData(ut, 0, 0);
  c.tom = !tegnet;
  return c;
}
function iEllerInntil(R, x, y) {
  /* ligger ruta i et beholdt felt, eller rett ved siden av et? */
  if (x < 0 || y < 0 || x >= R.w || y >= R.h) return false;
  const i = y * R.w + x,
    r = R.ryddet;
  return !!(
    r[i] ||
    (x > 0 && r[i - 1]) ||
    (x < R.w - 1 && r[i + 1]) ||
    (y > 0 && r[i - R.w]) ||
    (y < R.h - 1 && r[i + R.w])
  );
}
async function lastPlanFlis(tile, src) {
  try {
    if (tile.getTileCoord()[0] <= 9) {
      const t0 = performance.now(),
        c = grovPlanFlis(tile.getTileCoord());
      tidSlutt('planfliser', t0);
      if (!c) throw new Error('rutenettet er ikke klart');
      if (c.tom) {
        tile.setState(TOM);
        return;
      }
      tile.setImage(c);
      return;
    } /* lerretet brukes direkte som flisbilde, uten å pakke det som PNG og lese det inn igjen */
    const [K, planBuf] = await Promise.all([dagensKlasser(tile.getTileCoord()), hentPlan(src)]);
    if (!K) throw new Error('mangler dagens klasser');
    const c = lerret(),
      g = c.getContext('2d', { willReadFrequently: true }),
      bm = await createImageBitmap(new Blob([planBuf])),
      t0 = performance.now();
    g.drawImage(bm, 0, 0, 512, 512);
    const P = g.getImageData(0, 0, 512, 512).data,
      ut = g.createImageData(512, 512),
      o = ut.data;
    const pjor = rgb('pjor'),
      pnat = rgb('pnat'); /* uavhengig av hvilke klasser som vises i kartet */
    /* Smale striper skjules ved å kreve at punktet ligger i eller inntil et felt som overlevde ryddingen i rutenettet. */
    const [tz, tx, ty] = tile.getTileCoord(),
      R = !app.visSmale && gjeldende(app.planRaster),
      sh = R ? tz - R.z : 0;
    let tegnet = false;
    const vent =
      !app.visSmale &&
      !R &&
      app.valgt &&
      !app.oversikter[
        app.valgt.nr
      ]; /* rutenettet lages av det som er hentet, og flisen tegnes på nytt når det er klart */
    const EM = egenMaske(
      plannett.getTileCoordExtent(tile.getTileCoord())
    ); /* egne områder i flisen: 1 utbygging, 2 ikke utbygging */
    if (!vent)
      for (let py = 0, i = 0, q = 0; py < 512; py++)
        for (let px = 0; px < 512; px++, i += 4, q++) {
          const e = EM ? EM[q] : 0;
          if (e === 2 || K[i + 3] < 100 || (e !== 1 && P[i + 3] < 128))
            continue; /* tatt ut av planen, hav, eller utenfor planområdene */
          const k = klasseAv(K[i], K[i + 1], K[i + 2]);
          if (k !== JOR && k !== NAT) continue; /* allerede bebygd i dag, eller vann */
          if (e !== 1 && R && !iEllerInntil(R, ((tx * 512 + px) >> sh) - R.cx0, ((ty * 512 + py) >> sh) - R.cy0))
            continue;
          const f = k === JOR ? pjor : pnat;
          o[i] = f[0];
          o[i + 1] = f[1];
          o[i + 2] = f[2];
          o[i + 3] = 255;
          tegnet = true;
        }
    if (!tegnet) {
      tile.setState(TOM);
      tidSlutt('planfliser', t0);
      return;
    } /* de fleste fliser har ingen planlagt utbygging. Tomme fliser tegnes ikke, så laget koster ingenting der. */
    g.putImageData(ut, 0, 0);
    tile.setImage(c);
    tidSlutt('planfliser', t0);
  } catch (e) {
    tile.setState(3);
  }
}
const nyPlanKilde = () =>
  new XYZ({
    tileUrlFunction: planUrl,
    tileGrid: plannett,
    tilePixelRatio: 2,
    tileLoadFunction: lastPlanFlis,
    transition: 0,
    projection: UTM
  });
export const planLag = new TileLayer({ className: 'plan', source: nyPlanKilde(), visible: false });
export const tegnPlan = () => planLag.setSource(nyPlanKilde());
/* Omtrentlig areal, regnet ut i nettleseren: planflisene på nivå 9 (21 meter per piksel) legges oppå dagens klasser,
   og pikslene telles. Med lagret oversiktsbilde gjelder det hele kommunen. Uten gjelder det den delen av kommunen
   nettleseren har hentet kart for, og tallene regnes ut på nytt hver gang det kommer mer kart.
   Det gir et anslag til illustrasjon, ikke offisiell statistikk. */
let regnNr = 0;

/* Én flis på nivå 9: dagens klasser lagt oppå planen. K er dagens klasser og P planen, begge som piksler. fliser er de hentede
   kartflisene innenfor, eller null når hele kommunen er kjent. Ren regning. */
function tellBlokk(K, P, tc, fliser) {
  const d = new Uint8Array(262144),
    kl = new Uint8Array(262144),
    pl = new Uint8Array(262144),
    n = {
      beb: 0,
      nat: 0,
      jor: 0,
      pnat: 0,
      pjor: 0
    }; /* kl: dagens klasse per rute, 0 ukjent, 1 bebygd, 2 jordbruk, 3 natur, 4–6 vann */
  if (fliser) {
    d.fill(3);
    for (const [z, x, y] of fliser) {
      const sh = z - tc[0],
        s = 512 >> sh,
        cx = ((x * 512) >> sh) - tc[1] * 512,
        cy = ((y * 512) >> sh) - tc[2] * 512;
      for (let j = 0; j < s; j++) d.fill(0, (cy + j) * 512 + cx, (cy + j) * 512 + cx + s);
    }
  }
  for (let i = 0, q = 0; i < K.length; i += 4, q++) {
    if (K[i + 3] < 100) continue;
    const k = klasseAv(K[i], K[i + 1], K[i + 2]),
      plan = P[i + 3] >= 128; /* minst halve ruta ligger i en planflate */
    kl[q] = k + 1;
    if (plan && k <= NAT) pl[q] = 1; /* pl: planlagt utbygging på land, også der det alt er bebygd */
    if (!k) {
      n.beb++;
      continue;
    }
    if (k !== JOR && k !== NAT) continue; /* vann telles ikke */
    const jor = k === JOR;
    if (jor) {
      n.jor++;
      if (plan) n.pjor++;
    } else {
      n.nat++;
      if (plan) n.pnat++;
    }
    if (plan) d[q] = jor ? 2 : 1;
  }
  return { sig: fliser ? fliser.length : -1, d, kl, pl, n };
}
async function hentBlokk(tc, fliser) {
  const [K, buf] = await Promise.all([dagensKlasser(tc), ingenPlan() ? null : hentPlan(planUrl(tc))]);
  if (!K) throw new Error('mangler dagens klasser');
  const g = lerret().getContext('2d', { willReadFrequently: true });
  if (buf) g.drawImage(await createImageBitmap(new Blob([buf])), 0, 0, 512, 512);
  return { ...tellBlokk(K, g.getImageData(0, 0, 512, 512).data, tc, fliser), utenPlan: !buf };
}
function ryddStriper(d, w) {
  /* fjerner smale striper fra rutenettet, se forklaringen i byggPlanRaster. Ren regning. */
  const celler = [];
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (v === 1 || v === 2) celler.push(i);
  }
  const ryddet = new Uint8Array(d.length);
  let front = [];
  for (const i of celler) {
    const x = i % w;
    if (x > 0 && x < w - 1 && i >= w && i < d.length - w && d[i - 1] && d[i + 1] && d[i - w] && d[i + w]) {
      ryddet[i] = d[i];
      front.push(i);
    }
  }
  while (front.length) {
    const ny = [];
    for (const i of front)
      for (const j of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) {
        const v = d[j];
        if ((v === 1 || v === 2) && !ryddet[j]) {
          ryddet[j] = v;
          ny.push(j);
        }
      }
    front = ny;
  }
  let rn = 0,
    rj = 0;
  for (const i of celler) {
    if (ryddet[i] === 1) rn++;
    else if (ryddet[i] === 2) rj++;
  }
  return { celler, ryddet, rn, rj };
}
/* Setter blokkene sammen til ett rutenett for kommunen, legger inn egne områder og rydder bort smale striper. nokler er [x, y]
   for flisene på nivå 9, delvis sier at bare en del av kommunen er hentet, og rute er rutestørrelsen i meter slik den skal oppgis.
   Ren regning: leser ingenting fra siden og gir alt tilbake i ett objekt. */
function byggPlanRaster(nr, nokler, blokker, delvis, E, rute) {
  const Z = 9,
    kant = delvis ? 1 : 0,
    tx0 = Math.min(...nokler.map(t => t[0])),
    ty0 = Math.min(...nokler.map(t => t[1]));
  const cx0 = tx0 * 512 - kant,
    cy0 = ty0 * 512 - kant,
    w = (Math.max(...nokler.map(t => t[0])) - tx0 + 1) * 512 + 2 * kant,
    h = (Math.max(...nokler.map(t => t[1])) - ty0 + 1) * 512 + 2 * kant;
  /* Verdier per rute: 0 ingenting, 1 natur og 2 jordbruk satt av til utbygging, 3 ukjent fordi kartet ikke er hentet der.
     Ukjente ruter teller som naboer, så et felt ikke skrelles av langs kanten av det hentede. */
  let d = new Uint8Array(w * h);
  const kl = new Uint8Array(w * h),
    pl = new Uint8Array(w * h),
    n = { beb: 0, nat: 0, jor: 0, pnat: 0, pjor: 0 };
  if (delvis) d.fill(3);
  for (const [x, y] of nokler) {
    const b = blokker.get(`${x}/${y}`),
      start = ((y - ty0) * 512 + kant) * w + (x - tx0) * 512 + kant;
    for (let r = 0; r < 512; r++) {
      d.set(b.d.subarray(r * 512, r * 512 + 512), start + r * w);
      kl.set(b.kl.subarray(r * 512, r * 512 + 512), start + r * w);
      pl.set(b.pl.subarray(r * 512, r * 512 + 512), start + r * w);
    }
    for (const k in n) n[k] += b.n[k];
  }
  /* Egne områder: innenfor hvert tegnet område erstatter tegningen kommuneplanen. Som utbygging går all natur og alt jordbruk
     i området med. Som ikke utbygging fjernes det planen setter av der. Planen alene regnes også ut, så forskjellen kan vises. */
  let basis = null,
    eget = null,
    egetType = null;
  if (E.length) {
    basis = ryddStriper(d, w);
    d = d.slice();
    eget = new Uint8Array(w * h);
    egetType = new Uint8Array(w * h);
    E.forEach((g, i) => leggInnEget(g, i + 1, d, kl, eget, { cx0, cy0, w, h, m: OPPLOSNINGER[Z] / 2, type: egetType }));
  }
  /* Smale striper: et felt som ikke er bredere enn to ruter (rundt 40 meter) noe sted. De oppstår der plangrensen og grunnkartet ikke
     treffer hverandre, ofte langs eksisterende bebyggelse. Først finnes kjernene, altså ruter med planlagt utbygging på alle fire sider.
     Så beholdes alt som henger sammen med en kjerne. Et større felt beholdes dermed helt, også der det smalner av, og bare
     felt uten kjerne faller bort. */
  const { celler, ryddet, rn, rj } = ryddStriper(d, w);
  /* Per eget område: hva som ligger der i dag, hva planen alene tar (f) og hva som går med nå (n). */
  const egneTall = E.map(() => ({ nat: 0, jor: 0, beb: 0, vann: 0, ukjent: 0, fnat: 0, fjor: 0, nnat: 0, njor: 0 }));
  if (E.length)
    for (let i = 0; i < eget.length; i++) {
      const e = eget[i];
      if (!e) continue;
      const T = egneTall[e - 1],
        c = kl[i],
        b = basis.ryddet[i],
        ny = ryddet[i];
      if (c === 3) T.nat++;
      else if (c === 2) T.jor++;
      else if (c === 1) T.beb++;
      else if (c >= 4) T.vann++;
      else T.ukjent++;
      if (b === 1) T.fnat++;
      else if (b === 2) T.fjor++;
      if (ny === 1) T.nnat++;
      else if (ny === 2) T.njor++;
    }
  return {
    nr,
    z: Z,
    cx0,
    cy0,
    w,
    h,
    alle: d,
    ryddet,
    celler: Int32Array.from(celler),
    eget,
    egetType,
    kl,
    pl,
    antallEgne: E.length,
    basis,
    sum: { rn, rj },
    iDag: { nat: n.nat, jor: n.jor },
    n,
    delvis,
    fliser: nokler.length,
    rute,
    egneTall
  };
}
/* Samordner utregningen: finner ut hva som kan regnes ut nå, henter blokkene som mangler, bygger rutenettet og ber om ny tegning. */
async function regnPlan() {
  const mitt = ++regnNr,
    Z = 9;
  const sett = tilstand => {
    app.planTall = { tilstand };
    endret();
  };
  if (!app.klipp || utenPlan())
    return sett('tom'); /* knappen for planlagt utbygging styrer bare kartlaget, ikke tallene */
  const E = mine();
  if (app.planRaster && app.planRaster.nr !== app.valgt.nr) app.planRaster = null;
  if (!app.ov) return sett(app.oversikter[app.valgt.nr] ? 'tom' : 'zoom');
  const dyn = !!app.ov.dynamisk,
    sm = dyn ? M.samle : null,
    nr = app.valgt.nr,
    denne = app.ov;
  if (dyn && !sm) return;
  if (!(dyn && app.planRaster)) sett('regner'); /* nye tall erstatter de gamle uten at teksten blinker */
  /* Rutenettet bygges av blokker på 512 x 512 ruter, én per flis på nivå 9. En blokk regnes bare ut på nytt når det har kommet nye
     fliser innenfor den, så et nytt utsnitt koster én eller to blokker og ikke hele det hentede området. */
  const blokker = dyn ? sm.blokker : denne.blokker || (denne.blokker = new Map()),
    under = new Map();
  if (dyn)
    for (const v of sm.har) {
      const [z, x, y] = v.split('/').map(Number),
        k = `${x >> (z - Z)}/${y >> (z - Z)}`;
      if (!under.has(k)) under.set(k, []);
      under.get(k).push([z, x, y]);
    }
  else plannett.forEachTileCoord(denne.ext, Z, tc => under.set(`${tc[1]}/${tc[2]}`, null));
  try {
    await Promise.all(
      [...under].map(async ([k, fliser]) => {
        const har = blokker.get(k),
          sig = fliser ? fliser.length : -1;
        if (har && har.sig === sig && har.kl && har.pl && har.utenPlan === ingenPlan()) return;
        const [x, y] = k.split('/').map(Number),
          blokk = await hentBlokk([Z, x, y], fliser);
        blokker.set(k, blokk);
      })
    );
  } catch (e) {
    if (mitt === regnNr) sett('feil');
    return;
  }
  if (mitt !== regnNr || nr !== (app.valgt && app.valgt.nr)) return;
  const tStart = performance.now(),
    m = OPPLOSNINGER[Z] / 2,
    km2 = v => (v * m * m) / 1e6;
  app.planRaster = byggPlanRaster(
    nr,
    [...under.keys()].map(k => k.split('/').map(Number)),
    blokker,
    dyn,
    E,
    Math.round(dyn ? Math.max(m, sm.res) : m)
  );
  E.forEach((g, i) => {
    g.tall = app.planRaster.egneTall[i];
  });
  friskOpp(planLag);
  tidSlutt('plantall', tStart);
  app.planSum = { nr, nat: km2(app.planRaster.sum.rn), jor: km2(app.planRaster.sum.rj), delvis: dyn, egne: E.length };
  sett('ok');
}
/* Ikke alle kommuner har kommuneplanen sin hos DiBK. Ett lite bilde av hele kommunen viser hvor mye av flaten planlaget dekker.
   Langs grensen stikker naboenes planer litt inn, så under 15 prosent regnes som at kommunen ikke har plan der.
   Finnes det en plan, hentes navnet på den med ett oppslag i et punkt midt i det dekkede området. */

export const ingenPlan = () =>
  !!app.planInfo && !!app.valgt && app.planInfo.nr === app.valgt.nr && app.planInfo.tilstand === 'ingen';
export async function sjekkPlan(k, geom, mitt) {
  app.planInfo = { nr: k.nr, tilstand: 'sjekker' };
  endret();
  try {
    const { res, w, h, u } = rutenett(geom.getExtent(), 256);
    const felles = {
      service: 'WMS',
      version: '1.3.0',
      layers: 'kparealformalomrade',
      styles: 'polygon',
      crs: UTM,
      bbox: u.map(v => v.toFixed(1)).join(','),
      width: w,
      height: h
    };
    const buf = await hent(
      'DiBK',
      `Dekning av kommuneplan for ${k.navn}`,
      PLAN + '?' + new URLSearchParams({ ...felles, request: 'GetMap', format: 'image/png8', transparent: 'true' }),
      false,
      true
    );
    if (mitt !== M.valgNr) return;
    const a = tegneflate(w, h),
      b = tegneflate(w, h);
    a.drawImage(await createImageBitmap(new Blob([buf])), 0, 0, w, h);
    kommuneSti(b, geom, u, 1 / res);
    b.fill('evenodd');
    const P = a.getImageData(0, 0, w, h).data,
      Mk = b.getImageData(0, 0, w, h).data,
      treff = [];
    let inne = 0;
    for (let q = 0; q < w * h; q++)
      if (Mk[4 * q + 3] >= 128) {
        inne++;
        if (P[4 * q + 3] >= 100) treff.push(q);
      }
    const dekning = inne ? treff.length / inne : 0;
    let kilde = '';
    if (dekning >= 0.15)
      try {
        const q = treff[treff.length >> 1];
        const j = await hent(
          'DiBK',
          `Opplysninger om kommuneplanen for ${k.navn}`,
          PLAN +
            '?' +
            new URLSearchParams({
              ...felles,
              request: 'GetFeatureInfo',
              query_layers: 'kparealformalomrade',
              info_format: 'application/json',
              feature_count: 5,
              i: q % w,
              j: Math.floor(q / w)
            }),
          true
        );
        const f = (j.features || []).map(x => x.properties || {}).find(x => x['arealplanId.kommunenummer'] === k.nr);
        if (f) {
          const d = /^(\d{4})-(\d\d)-(\d\d)/.exec(f['kopidata.kopidato'] || ''),
            vert = f['kopidata.originalDatavert'];
          kilde = `plan ${f['arealplanId.planidentifikasjon']}${vert ? ' fra ' + vert : ''}${d ? `, kopiert til DiBK ${d[3]}.${d[2]}.${d[1]}` : ''}`;
        }
      } catch (e) {}
    if (mitt !== M.valgNr) return;
    app.planInfo = { nr: k.nr, tilstand: dekning < 0.15 ? 'ingen' : 'ok', dekning, kilde };
  } catch (e) {
    if (mitt !== M.valgNr) return;
    app.planInfo = { nr: k.nr, tilstand: 'feil' };
  }
  endret();
  visPlan();
  if (ingenPlan()) nyttSlor();
}
export const regnAlt = () =>
  regnPlan().then(() => {
    NATURLAG.forEach(regnNatur);
    regnGraa();
  }); /* påvirkningen på naturlagene følger plantallene */
export const visPlanLag = () => planLag.setVisible(app.planPaa && !!app.klipp && !utenPlan());
export const visPlan = () => {
  visPlanLag();
  endret();
  regnAlt();
};
export const nyttSlor = () => {
  if (KL.some(([id]) => !app.vis[id])) {
    tegnOversikt();
    fargeleggFliser();
  }
}; /* sløret over skjulte klasser følger planlaget */ /* resten av kartet står urørt når laget slås på */
/* Knappen for planlagt utbygging i tallpanelet: slår kartlaget av og på. */
export function byttPlanLag() {
  app.planPaa = !app.planPaa;
  visPlanLag();
  nyttSlor();
  endret();
}
/* Valget om smale striper under Tekniske valg. */
export function visSmaleStriper(paa) {
  app.visSmale = paa;
  friskOpp(planLag);
  endret();
}
