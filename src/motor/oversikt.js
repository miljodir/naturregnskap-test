/* Oversiktsbildet som vises når kartet er zoomet ut: det lagrede, eller det nettleseren setter sammen selv. */
import ImageLayer from 'ol/layer/Image';
import ImageSource from 'ol/source/Image';
import ImageStatic from 'ol/source/ImageStatic';
import ImageWrapper from 'ol/Image';
import { intersects } from 'ol/extent';
import { UTM, ORIGO, OPPLOSNINGER, FLISNIVA, MAKSRES, M, app, endret, hent, tidSlutt } from './felles.js';
import { flisnett, utdaterte, opptatt } from './nett.js';
import { fargeleggBlob, klassefarger, tilFarge } from './farger.js';
import { hentRaa, friskOppGamle } from './fliser.js';
import { tegnPlan, regnAlt } from './plan.js';
import { inonLag } from './inon.js';
import { graaLag } from './graa.js';
import { view, kartStatus, settEtterarbeid } from './kart.js';

/* Lagret oversiktsbilde: ett ferdig bilde per kommune, vist til kartet er zoomet inn nok til at NIBIO tegner selv.
   Registeret ligger i app.oversikter og bildet for valgt kommune i app.ov. */
let ovUrl = null;
/* Ett lag, i samme lerret som flisene. Bildet glattes når det vises forminsket, og tegnes med rene piksler når det
   forstørres som plassholder. Det styres per bilde i tegningen, ikke med to lag: et lag som først slås på midt i en
   zoombevegelse rekker ikke å laste bildet sitt, og da blinket bakgrunnskartet gjennom første gang man zoomet inn. */
export const oversiktLag = new ImageLayer({ className: 'tema' });
/* Kilde for kartet nettleseren setter sammen selv. Bildet er et lerret som fylles på flis for flis, og kartlaget får en kopi
   av det som bilde. Det sparer å pakke hele lerretet som PNG og lese det inn igjen hver gang det kommer nye fliser. */
class LerretKilde extends ImageSource {
  constructor(lerret, ext) {
    super({ projection: UTM });
    this.bilde_ = new ImageWrapper(ext, (ext[3] - ext[1]) / lerret.height, 1, 2 /* ferdig lastet */);
    this.bilde_.setImage(lerret);
    this.nr_ = 0;
  }
  getImageInternal(extent) {
    return intersects(extent, this.bilde_.getExtent()) ? this.bilde_ : null;
  }
  oppdater(lerret) {
    const mitt = ++this.nr_,
      bytt = ny => {
        const gml = this.bilde_.getImage();
        this.bilde_.setImage(ny);
        if (gml && gml !== ny && gml.close) gml.close();
        this.changed();
      };
    bytt(lerret); /* lerretet vises med en gang, og byttes med en kopi som tegnes raskere når den er klar */
    if (!window.createImageBitmap) return;
    createImageBitmap(lerret)
      .then(bm => {
        if (mitt !== this.nr_) {
          bm.close();
          return;
        }
        bytt(bm);
      })
      .catch(() => {});
  }
}
oversiktLag.on('prerender', e => {
  e.context.imageSmoothingEnabled = e.frameState.viewState.resolution >= M.ovRes;
});
oversiktLag.on('postrender', e => {
  e.context.imageSmoothingEnabled = true;
});
/* Uten bilde holdes laget skjult. Et synlig lag uten kilde får OpenLayers til å feile midt i en kartbevegelse,
   for eksempel når man bytter fra en kommune med oversiktsbilde til en uten. */
export const oversiktSynlig = v => oversiktLag.setVisible(v && !!oversiktLag.getSource());
export async function tegnOversikt() {
  const denne = app.ov;
  if (!denne) return;
  if (denne.lerret) {
    const s = M.samle;
    if (s && s.c === denne.lerret) {
      s.venter.length = 0;
      fargeleggSamling(s);
      visSamling(s);
    }
    return;
  }
  const blob = await fargeleggBlob(denne.buf);
  if (denne !== app.ov) return;
  const url = URL.createObjectURL(blob),
    gammel = ovUrl;
  ovUrl = url;
  M.ovRes =
    (denne.ext[2] - denne.ext[0]) / new DataView(denne.buf).getUint32(16); /* kartmeter per piksel i oversiktsbildet */
  const forste = !oversiktLag.getSource();
  oversiktLag.setSource(new ImageStatic({ url, imageExtent: denne.ext, projection: UTM }));
  if (forste) oversiktSynlig(true);
  if (gammel) setTimeout(() => URL.revokeObjectURL(gammel), 5000);
  /* Første gang et lagret oversiktsbilde er på plass, regnes planlagt utbygging ut. Senere fargebytter rører ikke planlaget. */
  if (!denne.regnet) {
    denne.regnet = true;
    M.ovBilde = null;
    tegnPlan();
    regnAlt();
  }
}

/* Kommuner uten lagret oversiktsbilde: nettleseren setter sammen sitt eget av flisene den har hentet. Zoomer man ut
   igjen, vises dermed det man alt har sett, i stedet for bare bakgrunnskartet. Det hentes ingenting nytt for dette.
   Lerretet c har de rå klassefargene og brukes til utregning. Lerretet vis har visningsfargene og er det som tegnes. */
const samlinger = new Map(); /* beholdes for de fire sist besøkte kommunene, så kartet er der når man bytter tilbake */
export function nySamling(nr, ext) {
  let s = samlinger.get(nr);
  if (!s) {
    const res = Math.max(OPPLOSNINGER[FLISNIVA] / 2, Math.max(ext[2] - ext[0], ext[3] - ext[1]) / 2048),
      c = document.createElement('canvas'),
      vis = document.createElement('canvas');
    c.width = vis.width = Math.ceil((ext[2] - ext[0]) / res);
    c.height = vis.height = Math.ceil((ext[3] - ext[1]) / res);
    s = {
      c,
      g: c.getContext('2d', { willReadFrequently: true }),
      vis,
      vg: vis.getContext('2d'),
      res,
      ext: [ext[0], ext[3] - c.height * res, ext[0] + c.width * res, ext[3]],
      har: new Set(),
      blokker: new Map(),
      kilde: null,
      venter: []
    };
  }
  samlinger.delete(nr);
  samlinger.set(nr, s);
  if (samlinger.size > 4) {
    const eldst = samlinger.keys().next().value,
      g = samlinger.get(eldst);
    g.c.width = g.vis.width = 0;
    g.blokker.clear();
    samlinger.delete(eldst);
  }
  M.samle = s;
  if (s.har.size) {
    app.ov = { lerret: s.c, ext: s.ext, dynamisk: true };
    tegnOversikt();
    kartStatus();
    regnAlt();
  }
  fyllSamling(s);
}
/* Fliser nettleseren alt har, lastes ikke på nytt, og kom derfor aldri inn i det sammensatte kartet for en kommune man byttet til
   etterpå. Når en kommune velges, legges derfor alle hentede fliser som berører den, inn fra minnet. Én om gangen, uten nye kall. */
async function fyllSamling(s) {
  const str = 256 * OPPLOSNINGER[FLISNIVA];
  for (const [url, buf] of [...hentRaa.lager]) {
    if (s !== M.samle) return;
    let b;
    try {
      b = new URL(url).searchParams.get('bbox').split(',').map(Number);
    } catch (e) {
      continue;
    }
    if (!b || b.length !== 4 || !(b[2] > b[0]) || !intersects(b, s.ext)) continue;
    const z = FLISNIVA + Math.round(Math.log2(str / (b[2] - b[0]))),
      side = 256 * OPPLOSNINGER[z];
    await leggISamling([z, Math.round((b[0] - ORIGO[0]) / side), Math.round((ORIGO[1] - b[3]) / side)], buf);
  }
}
function fargeleggSamling(s, x = 0, y = 0, w = s.c.width, h = s.c.height) {
  /* fra rå klassefarger til visningsfarger, for hele lerretet eller bare en flis */
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  w = Math.min(w, s.c.width - x);
  h = Math.min(h, s.c.height - y);
  if (w <= 0 || h <= 0) return;
  const t0 = performance.now(),
    F = klassefarger(),
    d = s.g.getImageData(x, y, w, h),
    o = d.data;
  let sist = -1,
    f = null;
  for (let i = 0; i < o.length; i += 4) {
    if (!o[i + 3]) continue;
    const n = ((o[i] << 24) | (o[i + 1] << 16) | (o[i + 2] << 8) | o[i + 3]) >>> 0;
    if (n !== sist) {
      sist = n;
      f = tilFarge(o[i], o[i + 1], o[i + 2], o[i + 3], F);
    } /* like nabopiksler regnes én gang */
    o[i] = f[0];
    o[i + 1] = f[1];
    o[i + 2] = f[2];
    o[i + 3] = f[3];
  }
  s.vg.putImageData(d, x, y);
  tidSlutt('fargelegging', t0);
}
function visSamling(s) {
  M.ovRes = s.res;
  s.kilde = s.kilde || new LerretKilde(s.vis, s.ext);
  const forste = !oversiktLag.getSource();
  if (oversiktLag.getSource() !== s.kilde) oversiktLag.setSource(s.kilde);
  if (forste) oversiktSynlig(true);
  s.kilde.oppdater(s.vis);
}
export function leggISamling(tc, buf) {
  const s = M.samle,
    n = tc.join('/');
  if (!s || s.har.has(n)) return Promise.resolve();
  return createImageBitmap(new Blob([buf]))
    .then(bm => {
      if (s !== M.samle || s.har.has(n)) {
        if (bm.close) bm.close();
        return;
      }
      const t0 = performance.now();
      s.har.add(n);
      utdaterte.add(inonLag).add(graaLag);
      /* Flisen legges på hele piksler. Ellers blir kantpikselen halvt gjennomsiktig fra begge naboflisene, og skjøten vises som en lys stripe. */
      const u = flisnett.getTileCoordExtent(tc),
        px = v => Math.round((v - s.ext[0]) / s.res),
        py = v => Math.round((s.ext[3] - v) / s.res);
      const X = px(u[0]),
        Y = py(u[3]),
        W = px(u[2]) - X,
        H = py(u[1]) - Y;
      s.g.drawImage(bm, X, Y, W, H);
      if (bm.close) bm.close();
      s.venter.push([X, Y, W, H]); /* fargelegges når kartet står stille */
      if (view.getResolution() >= MAKSRES)
        fargeleggVentende(s); /* zoomet ut vises det sammensatte kartet, så flisen må inn med en gang */
      if (!app.ov || app.ov.lerret !== s.c) {
        app.ov = { lerret: s.c, ext: s.ext, dynamisk: true };
        visSamling(s);
        kartStatus();
      }
      planleggEtterarbeid();
      tidSlutt('sammensatt kart', t0);
    })
    .catch(() => {});
}
/* Etterarbeidet når det har kommet nye fliser gjøres når kartet har stått stille litt, så det ikke hakker mens man flytter det:
   de nye flisene fargelegges inn i det sammensatte kartet, én om gangen med pust imellom, og når ingenting lastes lenger,
   regnes plantallene og planlaget ut på nytt. Starter man å flytte igjen, venter resten til neste stopp.
   Unntaket er når man zoomer ut til det sammensatte kartet er det eneste som vises. Da fargelegges alt som venter med en gang,
   ellers ville det man nettopp så på mangle. */
export function fargeleggVentende(s) {
  if (!s || !s.venter.length) return;
  while (s.venter.length) fargeleggSamling(s, ...s.venter.shift());
  if (s.kilde) s.kilde.oppdater(s.vis);
}
export function planleggEtterarbeid() {
  M.etterVenter = true;
  clearTimeout(M.etterTimer);
  M.etterTimer = setTimeout(async () => {
    if (M.iBevegelse) return; /* moveend tar opp tråden igjen */
    const s = M.samle,
      t0 = performance.now(),
      antall = s ? s.venter.length : 0;
    if (s && s.venter.length) {
      while (s.venter.length && !M.iBevegelse && s === M.samle) {
        fargeleggSamling(s, ...s.venter.shift());
        await new Promise(ok => setTimeout(ok, 0));
      }
      if (s.kilde) s.kilde.oppdater(s.vis); /* også når det ble avbrutt, så det som er gjort vises */
    }
    if (M.iBevegelse || s !== M.samle) return;
    friskOppGamle();
    if (opptatt()) return planleggEtterarbeid(); /* tallene venter til alt er hentet */
    M.etterVenter = false;
    await regnAlt();
    settEtterarbeid(
      `Siste etterarbeid: ${Math.round(performance.now() - t0)} ms for ${antall} ${antall === 1 ? 'ny flis' : 'nye fliser'}.`
    );
  }, 400);
}
export async function hentOversikt(k, mitt) {
  app.ov = null;
  M.ovBilde = null;
  M.samle = null;
  oversiktLag.setSource(null);
  oversiktSynlig(true);
  if (!app.oversikter[k.nr]) return;
  try {
    const buf = await hent('Egen fil', `Oversiktsbilde for ${k.navn}`, `oversikt/${k.nr}.png`, false, true);
    if (mitt !== M.valgNr) return;
    app.ov = { buf, ext: app.oversikter[k.nr] };
    await tegnOversikt();
  } catch (e) {
    if (mitt === M.valgNr) {
      delete app.oversikter[k.nr];
      kartStatus();
      endret();
    }
  }
}
