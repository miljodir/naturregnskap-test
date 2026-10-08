/* Rutenettene kartet bruker, lerreter og hjelpere for lag som tegnes i nettleseren, og køene for kall mot kartjenestene.
   Denne filen bruker bare felles.js, så de andre filene kan lage lagene sine med en gang de lastes. */
import TileGrid from 'ol/tilegrid/TileGrid';
import XYZ from 'ol/source/XYZ';
import { ORIGO, OPPLOSNINGER, FLISNIVA, UTM, SAMTIDIG, M, app, endret, flater, husk, kb, logg, nf } from './felles.js';

export const flisnett = new TileGrid({
  origin: ORIGO,
  resolutions: OPPLOSNINGER,
  tileSize: 256,
  minZoom: FLISNIVA
});
export const plannett = new TileGrid({ origin: ORIGO, resolutions: OPPLOSNINGER, tileSize: 256, minZoom: 5 });
export function kommuneSti(g, geom, u, s) {
  /* kommuneflaten som sti i et lerret der u er utsnittet og s er piksler per meter */
  g.beginPath();
  for (const flate of flater(geom))
    for (const ring of flate) {
      ring.forEach(([x, y], i) =>
        i ? g.lineTo((x - u[0]) * s, (u[3] - y) * s) : g.moveTo((x - u[0]) * s, (u[3] - y) * s)
      );
      g.closePath();
    }
}
export const lerret = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  return c;
};
/* Tegner et utsnitt av et bilde over hele flisen. Utsnittet klippes til bildet her, og målet krympes tilsvarende. Standarden sier at
   nettleseren skal gjøre det selv, men Safari har tegnet ingenting når utsnittet stikker utenfor bildet, og det gjør det for alle
   fliser langs kanten av kommunen når kartet er zoomet ut. */
export function tegnUtsnitt(g, bilde, sx, sy, sw, sh) {
  const x0 = Math.max(0, sx),
    y0 = Math.max(0, sy),
    x1 = Math.min(bilde.width, sx + sw),
    y1 = Math.min(bilde.height, sy + sh);
  if (!(x1 > x0 && y1 > y0)) return;
  const fx = 512 / sw,
    fy = 512 / sh;
  g.drawImage(bilde, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * fx, (y0 - sy) * fy, (x1 - x0) * fx, (y1 - y0) * fy);
}
/* Myker opp en maske litt, på stedet. Brukes for kommunebildene til inngrepsfri natur og grått areal. */
export function jevn(P, w, h) {
  /* myker opp maskene litt (vekter 1-2-1 begge veier), så sonegrensene ikke får trappetrinn fra rutene når kartet er zoomet langt inn */
  const n = 4 * w,
    over = new Uint8Array(n),
    denne = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    /* bortover, rad for rad */
    const o = y * n;
    denne.set(P.subarray(o, o + n));
    for (let x = 0; x < n; x += 4) {
      const a = x ? x - 4 : x,
        b = x < n - 4 ? x + 4 : x;
      P[o + x] = (denne[a] + 2 * denne[x] + denne[b] + 2) >> 2;
      P[o + x + 1] = (denne[a + 1] + 2 * denne[x + 1] + denne[b + 1] + 2) >> 2;
      P[o + x + 2] = (denne[a + 2] + 2 * denne[x + 2] + denne[b + 2] + 2) >> 2;
    }
  }
  over.set(P.subarray(0, n));
  for (let y = 0; y < h; y++) {
    /* nedover: raden over er tatt vare på før den ble skrevet over */
    const o = y * n,
      u = y < h - 1 ? o + n : o;
    denne.set(P.subarray(o, o + n));
    for (let x = 0; x < n; x += 4) {
      P[o + x] = (over[x] + 2 * denne[x] + P[u + x] + 2) >> 2;
      P[o + x + 1] = (over[x + 1] + 2 * denne[x + 1] + P[u + x + 1] + 2) >> 2;
      P[o + x + 2] = (over[x + 2] + 2 * denne[x + 2] + P[u + x + 2] + 2) >> 2;
    }
    over.set(denne);
  }
}
export const TOM = 4; /* OpenLayers' tilstand for en flis uten innhold */
/* Kilde for et lag som tegnes i nettleseren. Flisene har ingen adresse, bare plass i rutenettet. */
export const tegnetKilde = tegnFlis =>
  new XYZ({
    tileUrlFunction: tc => tc.join('/'),
    tileGrid: plannett,
    tilePixelRatio: 2,
    tileLoadFunction: tegnFlis,
    transition: 0,
    projection: UTM
  });
/* Tegner flisene i et lag på nytt. De gamle står til de nye er klare. */
let friskNr = 0;
export const utdaterte = new Set();
export const friskOpp = lag => {
  utdaterte.delete(lag);
  lag.getSource().setKey(String(++friskNr));
};

/* Én henter per kilde: egen kø med høyst fire kall om gangen, eget minne for rå flisbilder
   (så fargebytte og skjuling ikke krever nye kall), og én linje i kall-loggen per runde. */
const hentere = [];
export const opptatt = () => hentere.some(h => h.opptatt());
const settLaster = v => {
  if (app.laster === v) return;
  app.laster = v;
  endret();
};
export function lagHenter(kilde, hva) {
  const lager = new Map(),
    ko = [];
  let aktive = 0,
    timer = null,
    runde = { n: 0, bytes: 0, t0: 0, feil: 0 };
  const slipp = () => {
    while (aktive < SAMTIDIG && ko.length) {
      aktive++;
      ko.shift()();
    }
  };
  function ferdig() {
    if (aktive || ko.length) return;
    const fliser = n => `${n} ${n === 1 ? 'flis' : 'fliser'}`,
      ms = performance.now() - runde.t0;
    if (runde.n) {
      logg(kilde, `${hva}, ${fliser(runde.n)}`, ms, runde.bytes);
      app.siste = `Siste kall mot ${kilde}: ${fliser(runde.n)}, ${nf(ms / 1000)} s, ${kb(runde.bytes)}`;
    }
    if (runde.feil) {
      logg(kilde, `${hva}, ${fliser(runde.feil)}`, 0, 0, true);
      if (!runde.n) app.siste = `Kallet mot ${kilde} feilet.`;
    }
    settLaster(opptatt());
    endret();
    runde = { n: 0, bytes: 0, t0: 0, feil: 0 };
  }
  /* Kartlaget og planlaget trenger samme flis fra NIBIO samtidig. Et kall som alt er underveis, deles i stedet for å sendes to ganger. */
  const underveis = new Map();
  const hent = src => {
    const har = lager.get(src);
    if (har) return Promise.resolve(har);
    let p = underveis.get(src);
    if (!p) {
      p = hentNy(src);
      underveis.set(src, p);
      p.then(
        () => underveis.delete(src),
        () => underveis.delete(src)
      );
    }
    return p;
  };
  const hentNy = async src => {
    await new Promise(ok => {
      ko.push(ok);
      slipp();
    });
    clearTimeout(timer);
    if (!runde.t0) runde.t0 = performance.now();
    M.nyeKall = true;
    settLaster(true);
    try {
      const r = await fetch(src);
      if (!r.ok) throw new Error(r.status);
      if (!(r.headers.get('content-type') || '').startsWith('image')) throw new Error('ikke bilde');
      const buf = await r.arrayBuffer();
      husk(lager, src, buf, 400);
      runde.n++;
      runde.bytes += buf.byteLength;
      return buf;
    } catch (e) {
      runde.feil++;
      M.feilIVisning = true;
      throw e;
    } finally {
      aktive--;
      slipp();
      if (!aktive && !ko.length) timer = setTimeout(ferdig, 200);
    }
  };
  hent.opptatt = () => aktive > 0 || ko.length > 0;
  hent.lager = lager;
  hentere.push(hent);
  return hent;
}
