/* Selve kartet: bakgrunn, grense, klipping mot kommunen, status, måling og trykk i kartet. */
import OlMap from 'ol/Map';
import View from 'ol/View';
import Overlay from 'ol/Overlay';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import TileGrid from 'ol/tilegrid/TileGrid';
import { Style, Stroke, Fill } from 'ol/style';
import { Zoom, ScaleLine, Attribution } from 'ol/control';
import { fromLonLat } from 'ol/proj';
import { intersects } from 'ol/extent';
import { getRenderPixel, getVectorContext } from 'ol/render';
import {
  UTM,
  ORIGO,
  OPPLOSNINGER,
  FLISNIVA,
  MAKSRES,
  MAKSTETTHET,
  ALLE,
  KV,
  M,
  app,
  endret,
  farge,
  rgb,
  hent,
  finn,
  tidSlutt
} from './felles.js';
import { flisnett, opptatt } from './nett.js';
import { klare, tema, friskOppGamle } from './fliser.js';
import { oversiktLag, oversiktSynlig, fargeleggVentende, planleggEtterarbeid } from './oversikt.js';
import { planLag } from './plan.js';
import { NATURLAG, dekLag, flateLag, omrissLag, markLag } from './naturtema.js';
import { inonLag } from './inon.js';
import { graaLag } from './graa.js';
import { egneLag, tegner } from './egne.js';
import { velg } from './start.js';

const bakgrunn = new TileLayer({
  className: 'bakgrunn',
  source: new XYZ({
    projection: UTM,
    crossOrigin: 'anonymous',
    attributions: '© Kartverket, NIBIO, DiBK',
    tileGrid: new TileGrid({ origin: ORIGO, resolutions: OPPLOSNINGER, tileSize: 256 }),
    tileUrlFunction: ([z, x, y]) =>
      `https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/utm33n/${String(z).padStart(2, '0')}/${y}/${x}.png`
  })
});
export const grenseKilde = new VectorSource();
const grense = new VectorLayer({
  className: 'grense',
  source: grenseKilde,
  style: () => new Style({ stroke: new Stroke({ color: farge('ink'), width: 1.5 }) })
});
export const view = new View({
  projection: UTM,
  center: fromLonLat([15, 65], UTM),
  resolutions: OPPLOSNINGER.slice(2),
  resolution: OPPLOSNINGER[4],
  enableRotation: false
});
/* Kartet lages når siden er tegnet og kartflaten finnes. Det lages bare én gang. */
export let kart = null;
/* Elementer i siden som kartet plasserer selv. */
export const ui = { bytt: null };

const settSiste = tekst => {
  if (app.siste === tekst) return;
  app.siste = tekst;
  endret();
};
/* Oversiktsbildet ligger under flisene og vises mens nytt innhold lastes. Sammen med fliser nettleseren
   alt har fra andre zoomnivåer gjør det at kartet aldri står tomt. Når alle flisene i utsnittet er på plass, skjules det. */
export function kartStatus() {
  if (!kart) return;
  if (view.getResolution() < MAKSRES) {
    if (app.ute) {
      app.ute = false;
      endret();
    }
    return;
  }
  const o = (app.ov && app.ov.ext) || (app.valgt && app.oversikter[app.valgt.nr]),
    treff = !!o && intersects(view.calculateExtent(kart.getSize()), o);
  oversiktSynlig(true);
  app.ute = !treff && !!app.valgt;
  app.siste = !treff
    ? ''
    : app.ov && app.ov.dynamisk
      ? 'Viser kart nettleseren allerede har hentet'
      : 'Viser lagret oversiktsbilde';
  endret();
}
/* Måling til feilsøking: hvor jevnt kartet tegnes mens det flyttes, og hvor lang tid etterarbeidet tar. Vises under Tekniske valg. */
let maalRaf = 0,
  maalSist = 0,
  maalT = [],
  tegnT0 = 0;
const maalTekst = ['', ''];
function visMaaling() {
  const deler = Object.entries(M.bruk)
    .filter(([, b]) => b.sum >= 1)
    .sort((a, b) => b[1].sum - a[1].sum)
    .map(([navn, b]) => `${navn} ${Math.round(b.sum)} ms (${b.n} ganger, lengst ${Math.round(b.maks)} ms)`);
  const tekst = [...maalTekst, deler.length ? `Tid brukt siden flyttingen startet: ${deler.join(', ')}.` : '']
    .filter(Boolean)
    .join(' ');
  if (tekst === app.maaling) return;
  app.maaling = tekst;
  endret();
}
export function settEtterarbeid(tekst) {
  maalTekst[1] = tekst;
  visMaaling();
}
const maalBilde = t => {
  if (maalSist) maalT.push(t - maalSist);
  maalSist = t;
  maalRaf = requestAnimationFrame(maalBilde);
};
function maalFerdig() {
  cancelAnimationFrame(maalRaf);
  if (maalT.length < 5) return;
  const a = maalT.slice().sort((x, y) => x - y),
    median = a[a.length >> 1];
  maalTekst[0] = `Siste flytting: ${Math.round(1000 / median)} bilder per sekund, lengste opphold ${Math.round(a[a.length - 1])} ms, ${a.filter(v => v > 100).length} opphold over 0,1 s (${a.length} bilder).`;
  visMaaling();
}

/* Utenfor valgt kommune vises bare bakgrunnskartet: flisene klippes mot kommunens flate,
   hentes bare innenfor kommunens utstrekning, og slås først på når grensen er lastet. */
/* Der en flis er ferdig lastet, fjernes oversiktsbildet under den før flisen tegnes. Ellers ville det grove
   bildet stikke fram som en uskarp kant rundt alt som er gjennomsiktig i flisen, for eksempel langs sjøen. */
const dekket = ([z, x, y]) => {
  for (let d = 0; z - d >= FLISNIVA; d++) if (klare.has(`${z - d}/${x >> d}/${y >> d}`)) return true;
  return false;
};
const klippStil = new Style({ fill: new Fill({ color: '#000' }) });
/* Klippingen er det dyreste i hvert bilde når kartet flyttes, så den gjøres så sjelden som mulig:
   ikke i det hele tatt når kommunegrensen er utenfor utsnittet, og ellers én gang per lerret i stedet for én gang per lag. */
let klippBilde = null,
  klippTrengs = true,
  klippRinger = null,
  klippFor = null;
function grenseISyne(fs) {
  if (klippBilde === fs) return klippTrengs;
  klippBilde = fs;
  if (klippFor !== app.klipp) {
    klippFor = app.klipp;
    klippRinger = (
      app.klipp.getType() === 'MultiPolygon' ? app.klipp.getCoordinates().flat() : app.klipp.getCoordinates()
    ).map(r => Float64Array.from(r.flat()));
  }
  const m = 4 * fs.viewState.resolution,
    x0 = fs.extent[0] - m,
    y0 = fs.extent[1] - m,
    x1 = fs.extent[2] + m,
    y1 = fs.extent[3] + m;
  for (const r of klippRinger)
    for (let i = 0; i + 3 < r.length; i += 2) {
      const ax = r[i],
        ay = r[i + 1],
        bx = r[i + 2],
        by = r[i + 3];
      if ((ax < x0 && bx < x0) || (ax > x1 && bx > x1) || (ay < y0 && by < y0) || (ay > y1 && by > y1)) continue;
      return (klippTrengs = true); /* en del av grensen kan ligge i utsnittet */
    }
  return (klippTrengs = !app.klipp.intersectsCoordinate(
    fs.viewState.center
  )); /* helt innenfor: ingenting å klippe. Helt utenfor: alt skal bort. */
}
const klippTilKommunen = e => {
  if (!app.klipp || !grenseISyne(e.frameState)) return;
  const t0 = performance.now(),
    c = e.context,
    vc = getVectorContext(e);
  c.save();
  c.globalCompositeOperation = 'destination-in';
  vc.setStyle(klippStil);
  vc.drawGeometry(app.klipp);
  c.restore();
  tidSlutt('klipping', t0);
};
const tegnes = (lag, res) => lag.getVisible() && res < lag.getMaxResolution() && res >= lag.getMinResolution();
const klippSist = (lag, over) =>
  lag.on('postrender', e => {
    const res = e.frameState.viewState.resolution;
    if (!over.some(l => tegnes(l, res))) klippTilKommunen(e);
  }); /* det øverste laget i lerretet klipper for alle */

/* Kartet som kommunevelger: et trykk utenfor valgt kommune slår opp kommunen i punktet hos Kartverket og viser en knapp
   rett over punktet, med en prikk der man trykket. Byttet skjer først når man trykker på knappen, så et bomtrykk ved grensen ikke bytter kommune.
   Knappen holdes innenfor kartflaten og unna zoomknappene, og følger punktet når kartet flyttes. */
let byttLag = null,
  byttSok = 0,
  byttKoord = null;
export function lukkBytt() {
  byttSok++;
  byttKoord = null;
  if (byttLag) byttLag.setPosition(undefined);
  if (app.bytt) {
    app.bytt = null;
    endret();
  }
}
export function plasserBytt() {
  const bytt = ui.bytt;
  if (!kart || !bytt || bytt.hidden || !byttKoord) return;
  const px = kart.getPixelFromCoordinate(byttKoord),
    [w, h] = kart.getSize(),
    bw = bytt.offsetWidth,
    bh = bytt.offsetHeight;
  if (!px || px[0] < -20 || px[1] < -20 || px[0] > w + 20 || px[1] > h + 20) {
    lukkBytt();
    return;
  } /* punktet er flyttet ut av kartet */
  const x = Math.max(8, Math.min(w - bw - 8, px[0] - bw / 2));
  let y = px[1] - bh - 16;
  if (y < 8 || (y < 116 && x + bw > w - 62))
    y = px[1] + 16; /* under punktet hvis det ikke er plass over, eller zoomknappene er i veien */
  bytt.style.left = x + 'px';
  bytt.style.top = Math.max(8, Math.min(h - bh - 8, y)) + 'px';
}
export function byttTil() {
  const nr = app.bytt && app.bytt.nr;
  lukkBytt();
  if (nr) velg(nr, true);
}
const settProbe = probe => {
  app.probe = probe;
  endret();
};
async function finnKommune(koord) {
  lukkBytt();
  const mitt = byttSok;
  settProbe({ tekst: 'Slår opp kommunen …' });
  try {
    const j = await hent(
      'Kartverket',
      'Kommune i punktet',
      `${KV}/punkt?nord=${koord[1].toFixed(0)}&ost=${koord[0].toFixed(0)}&koordsys=25833`,
      true,
      false,
      true
    );
    if (mitt !== byttSok) return;
    const t = finn(j.kommunenummer);
    if (!t || (app.valgt && t[1].nr === app.valgt.nr)) throw new Error('ingen annen kommune');
    app.bytt = { nr: t[1].nr, navn: t[1].navn };
    byttKoord = koord;
    byttLag.setPosition(koord);
    settProbe({ fet: `${t[1].navn} kommune` });
  } catch (e) {
    if (mitt === byttSok) settProbe({ tekst: 'Fant ingen annen kommune her.' });
  }
}
function trykk(e) {
  if (tegner()) return; /* under tegning er trykk i kartet hjørner i området */
  if (app.klipp && !app.klipp.intersectsCoordinate(e.coordinate)) {
    finnKommune(e.coordinate);
    return;
  }
  lukkBytt();
  const c = e.coordinate,
    iVern = NATURLAG.map(t => {
      if (!t.lag.getVisible() || !t.data) return null;
      const o = t.data.omrader.find(
        o =>
          c[0] >= o.ext[0] &&
          c[0] <= o.ext[2] &&
          c[1] >= o.ext[1] &&
          c[1] <= o.ext[3] &&
          o.f.getGeometry().intersectsCoordinate(c)
      );
      return o ? ` · ${o.navn}${t.samlet && o.under ? ` (${o.under.toLowerCase()})` : ''}` : null;
    })
      .filter(Boolean)
      .join('');
  const pl = app.planPaa && planLag.getVisible() ? planLag.getData(e.pixel) : null;
  if (pl && pl[3] > 40) {
    const av = c => (pl[0] - c[0]) ** 2 + (pl[1] - c[1]) ** 2 + (pl[2] - c[2]) ** 2;
    settProbe({
      fet: (av(rgb('pjor')) < av(rgb('pnat')) ? 'Jordbruk' : 'Natur') + ', satt av til framtidig utbygging' + iVern
    });
    return;
  }
  let d = tema.getVisible() ? tema.getData(e.pixel) : null;
  if ((!d || d[3] < 40) && app.ov && oversiktLag.getVisible()) d = oversiktLag.getData(e.pixel);
  if (!d || d[3] < 40) {
    settProbe({ tekst: 'Ingen synlig klasse her (skjult kartlag, eller kartet er ikke hentet).' });
    return;
  }
  let best = null,
    min = 1e9;
  [...ALLE.filter(k => app.vis[k[0]]), ['slor', null]].forEach(([id, navn]) => {
    const c = rgb(id),
      a = (d[0] - c[0]) ** 2 + (d[1] - c[1]) ** 2 + (d[2] - c[2]) ** 2;
    if (a < min) {
      min = a;
      best = navn;
    }
  });
  if (!best) {
    settProbe({ tekst: 'Kartlaget for dette punktet er skjult.' });
    return;
  }
  settProbe({ fet: best + iVern });
}

export function lagKart(maal) {
  kart = new OlMap({
    target: maal,
    layers: [
      bakgrunn,
      oversiktLag,
      tema,
      inonLag,
      graaLag,
      dekLag,
      ...flateLag,
      planLag,
      ...omrissLag,
      grense,
      egneLag,
      markLag
    ],
    view,
    pixelRatio: Math.min(window.devicePixelRatio || 1, MAKSTETTHET),
    controls: [
      new Zoom({ zoomInTipLabel: 'Zoom inn', zoomOutTipLabel: 'Zoom ut' }),
      new ScaleLine(),
      new Attribution({ collapsible: false })
    ]
  });
  window.kart = kart; /* regresjonstesten flytter kartet med denne */
  /* Når selve siden er forstørret, fyller kartet fort hele skjermen. Fanget kartet da alle bevegelser, kom man ikke ut igjen.
     Kartet slipper derfor knip og dra igjennom til nettleseren så lenge siden er forstørret. Knappene for zoom og trykk i kartet virker fortsatt. */
  if (window.visualViewport) {
    const vv = window.visualViewport;
    let stor = false;
    const sjekk = () => {
      const na = vv.scale > 1.03;
      if (na === stor) return;
      stor = na;
      document.documentElement.classList.toggle('sidezoom', stor);
      kart.getViewport().style.touchAction = stor ? 'auto' : 'none';
      kart.getInteractions().forEach(i => i.setActive(!stor));
      app.sidezoom = stor;
      endret();
    };
    vv.addEventListener('resize', sjekk);
    vv.addEventListener('scroll', sjekk);
    sjekk();
  }
  tema.on('prerender', e => {
    const fs = e.frameState,
      res = fs.viewState.resolution;
    if (!app.ov || !oversiktLag.getVisible() || res >= MAKSRES) return;
    const c = e.context;
    flisnett.forEachTileCoord(fs.extent, flisnett.getZForResolution(res), tc => {
      if (!dekket(tc)) return;
      const u = flisnett.getTileCoordExtent(tc);
      const a = getRenderPixel(e, kart.getPixelFromCoordinate([u[0], u[3]])),
        b = getRenderPixel(e, kart.getPixelFromCoordinate([u[2], u[1]]));
      const x0 = Math.floor(a[0]),
        y0 = Math.floor(a[1]);
      c.clearRect(x0, y0, Math.ceil(b[0]) - x0, Math.ceil(b[1]) - y0);
    });
  });
  klippSist(oversiktLag, [tema, inonLag, graaLag]);
  klippSist(tema, [inonLag, graaLag]);
  klippSist(inonLag, [graaLag]);
  klippSist(graaLag, []);
  [dekLag, ...flateLag, planLag, ...omrissLag].forEach((l, i, alle) =>
    klippSist(l, alle.slice(i + 1))
  ); /* disse deler lerret */
  kart.on('precompose', () => {
    tegnT0 = performance.now();
  });
  kart.on('postcompose', () => {
    if (tegnT0) tidSlutt('tegning', tegnT0);
  });
  setInterval(() => {
    if (!M.iBevegelse) visMaaling();
  }, 1500);
  kart.on('movestart', () => {
    M.iBevegelse = true;
    M.nyeKall = false;
    M.feilIVisning = false;
    oversiktSynlig(true);
    clearTimeout(M.etterTimer);
    cancelAnimationFrame(maalRaf);
    maalT = [];
    maalSist = 0;
    M.bruk = {};
    maalRaf = requestAnimationFrame(maalBilde);
  });
  kart.on('moveend', () => {
    M.iBevegelse = false;
    maalFerdig();
    kartStatus();
    kart.render();
    friskOppGamle();
    if (M.etterVenter) planleggEtterarbeid();
  });
  view.on('change:resolution', () => {
    if (view.getResolution() >= MAKSRES) {
      oversiktSynlig(true);
      fargeleggVentende(M.samle);
    }
  });
  kart.on('rendercomplete', () => {
    if (M.iBevegelse || view.getResolution() >= MAKSRES || !app.valgt || !tema.getVisible() || opptatt())
      return; /* aldri skjul oversikten midt i en bevegelse */
    if (!M.feilIVisning) oversiktSynlig(false);
    if (!M.nyeKall) settSiste('Ingen nye kall. Flisene lå allerede i nettleseren.');
  });
  const prikk = document.createElement('div');
  prikk.className = 'punkt';
  byttLag = new Overlay({ element: prikk, positioning: 'center-center', stopEvent: false });
  kart.addOverlay(byttLag);
  kart.on('postrender', plasserBytt);
  kart.on('singleclick', trykk);
}
