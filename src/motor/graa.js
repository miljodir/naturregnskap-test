/* Grått areal fra Miljødirektoratets kart over grå arealer (NIBIO, testversjon): areal som alt er tatt i bruk eller sterkt påvirket
   av bygge- og anleggsaktivitet. Flatene har andel vegetasjon i fem trinn. Hentes som to bilder av hele kommunen når den velges,
   med egen stil uten kantstrek. Tallene og kartlaget zoomet ut lages av det i nettleseren. Zoomet inn hentes laget som fliser. Grått betyr ikke ledig: et boligområde i bruk er like grått som en nedlagt fabrikktomt. */
import TileLayer from 'ol/layer/Tile';
import { intersects } from 'ol/extent';
import {
  UTM,
  ORIGO,
  OPPLOSNINGER,
  FLISNIVA,
  M,
  app,
  endret,
  rgb,
  hent,
  husk,
  gjeldende,
  rutenett,
  tegneflate,
  utm33,
  tidSlutt
} from './felles.js';
import { plannett, lerret, kommuneSti, tegnUtsnitt, jevn, TOM, tegnetKilde, friskOpp, lagHenter } from './nett.js';
import { klasseAv } from './farger.js';
import { dagensKlasser, friskOppGamle } from './fliser.js';
import { utenPlan } from './egne.js';

const GRAA = 'https://wms.nibio.no/cgi-bin/graastruktur';
export const GRAATRINN = [
  ['graa1', 'Under 1 % vegetasjon', 0, 1],
  ['graa2', '1–25 % vegetasjon', 1, 25],
  ['graa3', '25–50 % vegetasjon', 25, 50],
  ['graa4', '50–75 % vegetasjon', 50, 75],
  ['graa5', '75–100 % vegetasjon', 75, 101]
];
/* Egne stiler uten kantstrek. Alt grått areal tegnes i svart. Flatene med oppgitt andel vegetasjon får en rødfarge som sier hvilket
   trinn de er i. Kartflisene henter begge lagene i ett bilde. Til tallene hentes de hver for seg: i ett bilde blandes fargene
   langs kantene, og med ruter på 20 meter ga det for mye grått areal og for lite vegetasjon. */
const graaFyll = f =>
  `<PolygonSymbolizer><Fill><CssParameter name="fill">${f}</CssParameter></Fill></PolygonSymbolizer>`;
const graaLagStil = [
  `<NamedLayer><Name>graa_arealer</Name><UserStyle><FeatureTypeStyle><Rule>${graaFyll('#000000')}</Rule></FeatureTypeStyle></UserStyle></NamedLayer>`,
  `<NamedLayer><Name>andel_med_vegetasjon</Name><UserStyle><FeatureTypeStyle>${GRAATRINN.map(([, , fra, til], i) => `<Rule><ogc:Filter><ogc:And><ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>andelgron</ogc:PropertyName><ogc:Literal>${fra}</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyIsLessThan><ogc:PropertyName>andelgron</ogc:PropertyName><ogc:Literal>${til}</ogc:Literal></ogc:PropertyIsLessThan></ogc:And></ogc:Filter>${graaFyll('#' + (51 * (i + 1)).toString(16).padStart(2, '0') + '0000')}</Rule>`).join('')}</FeatureTypeStyle></UserStyle></NamedLayer>`
];
const graaBilde = (hva, u, w, h) =>
  GRAA +
  '?' +
  new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: ['graa_arealer', 'andel_med_vegetasjon'].filter((_, i) => hva.includes(i)).join(','),
    sld_body: `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">${graaLagStil.filter((_, i) => hva.includes(i)).join('')}</StyledLayerDescriptor>`,
    crs: UTM,
    bbox: u.map(v => v.toFixed(2)).join(','),
    width: w,
    height: h,
    format: 'image/png',
    transparent: 'true'
  });
const graaTrinn = (r, a) =>
  a < 128
    ? 0
    : r < 26
      ? 6
      : Math.min(
          5,
          Math.max(1, Math.round(r / 51))
        ); /* 0 ikke grått, 1–5 andel vegetasjon, 6 grått uten oppgitt andel */
const hentGraaFlis = lagHenter('NIBIO', 'Grått areal');
const graaMinne = new Map();
/* Trinn i et punkt: 0 ikke grått, 1–5 andel vegetasjon fra lavest til høyest, 6 grått uten oppgitt andel (veier og lignende). */
const graaVed = (D, x, y) => {
  const px = Math.floor((x - D.u[0]) / D.res),
    py = Math.floor((D.u[3] - y) / D.res);
  return px < 0 || py < 0 || px >= D.w || py >= D.h ? 0 : D.kl[py * D.w + px];
};
async function lastGraaFlis(tile) {
  try {
    const D = app.graa && app.valgt && app.graa.nr === app.valgt.nr && app.graa.tilstand === 'ok' ? app.graa : null,
      tc = tile.getTileCoord(),
      u = plannett.getTileCoordExtent(tc);
    if (!D || !intersects(u, D.u)) {
      tile.setState(TOM);
      return;
    }
    const c = lerret(),
      g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    if (tc[0] >= FLISNIVA) {
      /* zoomet inn: flisen hentes fra tjenesten, så små flater blir skarpe. Zoomet ut holder kommunebildet. */
      g.drawImage(
        await createImageBitmap(new Blob([await hentGraaFlis(graaBilde([0, 1], u, 512, 512))])),
        0,
        0,
        512,
        512
      );
      const K = await dagensKlasser(tc).catch(
        () => null
      ); /* dagens klasser: bebygd som ikke er grått, tegnes som grønt i bebygd område */
      const t1 = performance.now(),
        bilde = g.getImageData(0, 0, 512, 512),
        o = bilde.data,
        F = [null, ...GRAATRINN.map(x => rgb(x[0])), rgb('graa0')],
        GR = rgb('gront');
      let noe = false;
      for (let i = 0; i < o.length; i += 4) {
        const a = o[i + 3],
          k = a >= 64 ? graaTrinn(o[i], 255) : 0,
          f = k ? F[k] : K && K[i + 3] >= 100 && klasseAv(K[i], K[i + 1], K[i + 2]) === 0 ? GR : null;
        if (!f) {
          o[i + 3] = 0;
          continue;
        }
        o[i] = f[0];
        o[i + 1] = f[1];
        o[i + 2] = f[2];
        o[i + 3] = 255;
        noe = true;
      }
      if (!noe) {
        tile.setState(TOM);
        return;
      }
      g.putImageData(bilde, 0, 0);
      tile.setImage(c);
      tidSlutt('grått areal, fliser', t1);
      return;
    }
    const K = await dagensKlasser(tc).catch(() => null),
      t0 = performance.now(),
      GR = rgb('gront');
    tegnUtsnitt(
      g,
      D.c,
      (u[0] - D.u[0]) / D.res,
      (D.u[3] - u[3]) / D.res,
      (u[2] - u[0]) / D.res,
      (u[3] - u[1]) / D.res
    ); /* utjevnet maske: glatt kant rundt det grå */
    const P = g.getImageData(0, 0, 512, 512).data,
      ut = g.createImageData(512, 512),
      o = ut.data,
      F = [null, ...GRAATRINN.map(x => rgb(x[0])), rgb('graa0')],
      m = (u[2] - u[0]) / 512;
    let tegnet = false;
    const kol = new Int32Array(512),
      w = D.w,
      h = D.h;
    for (let px = 0; px < 512; px++) kol[px] = Math.floor((u[0] + (px + 0.5) * m - D.u[0]) / D.res);
    for (let py = 0, i = 0; py < 512; py++) {
      const rad = Math.floor((D.u[3] - (u[3] - (py + 0.5) * m)) / D.res);
      for (let px = 0; px < 512; px++, i += 4) {
        const x = kol[px],
          inne = P[i + 3] >= 128 && x >= 0 && x < w && rad >= 0 && rad < h;
        let f = null;
        if (inne && P[i] >= 128) {
          const q = rad * w + x;
          f =
            F[
              D.kl[q] ||
                (x > 0 && D.kl[q - 1]) ||
                (x < w - 1 && D.kl[q + 1]) ||
                (rad > 0 && D.kl[q - w]) ||
                (rad < h - 1 && D.kl[q + w]) ||
                6
            ];
        } /* i kanten kan masken nå litt lenger enn rutene */
        else if (K && (!inne || P[i] < 64) && K[i + 3] >= 100 && klasseAv(K[i], K[i + 1], K[i + 2]) === 0) f = GR;
        if (!f) continue;
        o[i] = f[0];
        o[i + 1] = f[1];
        o[i + 2] = f[2];
        o[i + 3] = 255;
        tegnet = true;
      }
    }
    if (!tegnet) {
      tile.setState(TOM);
      return;
    }
    g.putImageData(ut, 0, 0);
    tile.setImage(c);
    tidSlutt('grått areal, fliser', t0);
  } catch (e) {
    tile.setState(3);
  }
}
export const graaLag = new TileLayer({ className: 'tema', visible: false, source: tegnetKilde(lastGraaFlis) });
/* Tolker de to bildene av kommunen. P er bildet av alt grått areal, V bildet av flatene med oppgitt andel vegetasjon og Mk kommunens
   flate, alle som piksler i samme rutenett. Gir trinnet per rute og arealet per trinn i km². P gjøres samtidig om til en utjevnet
   maske over det grå, som kartlaget tegnes fra. Ren regning. */
function tolkGraa(P, V, Mk, w, h, res, m2) {
  const kl = new Uint8Array(w * h),
    n = new Int32Array(7);
  for (let i = 0, q = 0; i < P.length; i += 4, q++) {
    const t = V[i + 3] >= 128 ? graaTrinn(Math.max(26, V[i]), 255) : P[i + 3] >= 128 ? 6 : 0;
    kl[q] = t;
    if (t && Mk[i + 3] >= 128) n[t]++;
    P[i] = P[i + 1] = P[i + 2] = t ? 255 : 0;
    P[i + 3] = 255;
  }
  jevn(P, w, h);
  const trinn = Array.from(n, v => Math.round(((v * res * res) / m2) * 100) / 100);
  return { kl, trinn, sum: Math.round(trinn.reduce((x, y) => x + y, 0) * 100) / 100 };
}
export async function sjekkGraa(k, geom, mitt) {
  const har = graaMinne.get(k.nr);
  if (har) {
    husk(graaMinne, k.nr, har, 3);
    app.graa = har;
    friskOpp(graaLag);
    visGraa();
    regnGraa();
    return;
  }
  app.graa = { nr: k.nr, tilstand: 'henter' };
  visGraa();
  try {
    const { res, w, h, u } = rutenett(geom.getExtent(), 2048, 20);
    const [b1, b2] = await Promise.all([
      hent('NIBIO', `Grått areal i ${k.navn}`, graaBilde([0], u, w, h), false, true),
      hent('NIBIO', `Vegetasjon i grått areal i ${k.navn}`, graaBilde([1], u, w, h), false, true)
    ]);
    if (mitt !== M.valgNr) return;
    const t0 = performance.now(),
      a = tegneflate(w, h),
      b = tegneflate(w, h);
    a.drawImage(await createImageBitmap(new Blob([b1])), 0, 0, w, h);
    const A = a.getImageData(0, 0, w, h);
    b.drawImage(await createImageBitmap(new Blob([b2])), 0, 0, w, h);
    const V = b.getImageData(0, 0, w, h).data;
    b.clearRect(0, 0, w, h);
    kommuneSti(b, geom, u, 1 / res);
    b.fill('evenodd');
    const tall = tolkGraa(A.data, V, b.getImageData(0, 0, w, h).data, w, h, res, utm33(geom));
    a.putImageData(A, 0, 0);
    app.graa = { nr: k.nr, tilstand: 'ok', ...tall, c: a.canvas, u, res, w, h };
    husk(graaMinne, k.nr, app.graa, 3);
    tidSlutt('grått areal, kommunebilde', t0);
  } catch (e) {
    if (mitt !== M.valgNr) return;
    app.graa = { nr: k.nr, tilstand: 'feil' };
  }
  friskOpp(graaLag);
  visGraa();
  regnGraa();
}
/* Planlagt utbygging krysset med grått areal: hvor mye av all planlagt utbygging på land som ligger på areal som alt er grått,
   altså gjenbruk, og hvor mye av det som er minst halvparten vegetasjon. Regnes for kommuneplanen alene og med egne områder.
   Her er alle ruter med planlagt utbygging med, også der det er bebygd i dag, og uten regelen om smale striper. */
function kryssGraa(R, D, delvis) {
  /* R: rutenettet for planen. D: grått areal for kommunen. Ren regning. */
  const nE = R.egetType ? R.antallEgne : 0,
    tom = () => ({ tot: 0, graa: 0, gron: 0, gront: 0 }),
    ny = () => ({ ...tom(), eg: Array.from({ length: nE }, tom) }),
    S = ny(),
    P = ny(),
    m = OPPLOSNINGER[R.z] / 2;
  const en = (x, k, c) => {
      x.tot++;
      if (k) x.graa++;
      else if (c === 1) x.gront++;
      if (k === 4 || k === 5) x.gron++;
    },
    legg = (T, e, k, c) => {
      en(T, k, c);
      if (e) en(T.eg[e - 1], k, c);
    };
  let bebygd = 0,
    gront = 0; /* gront: bebygd i grunnkartet, men ikke grått. Det er grønne arealer som parker og idrettsanlegg. */
  for (let i = 0; i < R.kl.length; i++) {
    const c = R.kl[i];
    if (c < 1 || c > 3) continue;
    const b = R.pl[i],
      ty = nE ? R.egetType[i] : 0,
      s = ty === 1 ? 1 : ty === 2 ? 0 : b;
    if (c !== 1 && !b && !s) continue;
    const k = graaVed(D, ORIGO[0] + (R.cx0 + (i % R.w) + 0.5) * m, ORIGO[1] - (R.cy0 + Math.floor(i / R.w) + 0.5) * m),
      e = nE ? R.eget[i] : 0;
    if (c === 1) {
      bebygd++;
      if (!k) gront++;
    }
    if (s) legg(S, e, k, c);
    if (b) legg(P, e, k, c);
  }
  return { nr: R.nr, S, P, bebygd, gront, antallEgne: nE, delvis };
}
export function regnGraa() {
  const R =
      app.planRaster && app.valgt && app.planRaster.nr === app.valgt.nr && app.planRaster.pl && !utenPlan()
        ? app.planRaster
        : null,
    D = app.graa && app.valgt && app.graa.nr === app.valgt.nr && app.graa.tilstand === 'ok' ? app.graa : null,
    t0 = performance.now();
  app.graaKryss = R && D ? kryssGraa(R, D, !!(app.ov && app.ov.dynamisk)) : null;
  if (app.graaKryss) tidSlutt('grått areal, kryssing', t0);
  visGraa();
}
/* Kartlaget følger valget og om kommunen har grått areal. Teksten tegnes av komponentene. */
export function visGraa() {
  const D = gjeldende(app.graa),
    har = !!D && D.tilstand === 'ok' && D.sum > 0;
  graaLag.setVisible(app.graaPaa && !!app.klipp && har);
  friskOppGamle();
  endret();
}
export function byttGraa() {
  app.graaPaa = !app.graaPaa;
  visGraa();
}
