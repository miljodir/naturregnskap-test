/* Farger: stilen som sendes til NIBIO, tolking av fargene i svaret, og fargelegging i nettleseren. */
import { ALLE, DATAFARGE, app, rgb, tidSlutt } from './felles.js';
import { ingenPlan } from './plan.js';

/* Stilen som sendes til NIBIO: seks regler med rene farger. Den er lik i alle kall. */
export const SLD = (() => {
  const hex = f => '#' + f.map(v => v.toString(16).padStart(2, '0')).join('');
  const regler = ALLE.map(([id, , verdier]) => {
    let f = verdier
      .map(
        v =>
          `<ogc:PropertyIsEqualTo><ogc:PropertyName>okosystemtypeniva1</ogc:PropertyName><ogc:Literal>${v}</ogc:Literal></ogc:PropertyIsEqualTo>`
      )
      .join('');
    if (verdier.length > 1) f = `<ogc:Or>${f}</ogc:Or>`;
    return `<Rule><ogc:Filter>${f}</ogc:Filter><PolygonSymbolizer><Fill><CssParameter name="fill">${hex(DATAFARGE[id])}</CssParameter></Fill></PolygonSymbolizer></Rule>`;
  }).join('');
  return `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>okosystemtype</Name><UserStyle><FeatureTypeStyle>${regler}</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;
})();

/* Fargelegging i nettleseren. Bildet fra NIBIO har en fargetabell med opptil 256 farger.
   Siden bytter ut tabellen og lar selve bildet være, så skjuling av klasser og fargebytte trenger ikke nytt kall. */
/* Hver farge i bildet tolkes som en blanding av de to klassene den ligger nærmest linjen mellom.
   Oppslaget regnes ut én gang, for 32 nivåer per fargekanal: klasse A, klasse B og hvor mye av A. */
const LA = new Uint8Array(32768),
  LB = new Uint8Array(32768),
  LT = new Uint8Array(32768);
{
  const P = ALLE.map(([id]) => DATAFARGE[id]);
  for (let q = 0; q < 32768; q++) {
    const p = [((q >> 10) * 255) / 31, (((q >> 5) & 31) * 255) / 31, ((q & 31) * 255) / 31];
    let best = Infinity;
    for (let a = 0; a < P.length; a++)
      for (let b = a + 1; b < P.length; b++) {
        let dd = 0,
          pd = 0;
        for (let k = 0; k < 3; k++) {
          const d = P[a][k] - P[b][k];
          dd += d * d;
          pd += (p[k] - P[b][k]) * d;
        }
        const t = Math.max(0, Math.min(1, pd / dd));
        let e = 0;
        for (let k = 0; k < 3; k++) {
          const d = p[k] - P[b][k] - t * (P[a][k] - P[b][k]);
          e += d * d;
        }
        if (e < best) {
          best = e;
          LA[q] = a;
          LB[q] = b;
          LT[q] = Math.round(t * 255);
        }
      }
  }
}
const oppslag = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
export const klasseAv = (r, g, b) => {
  const q = oppslag(r, g, b);
  return LT[q] >= 128 ? LA[q] : LB[q];
}; /* klassen det er mest av i pikselen */
/* Fargene som brukes nå. En skjult klasse er gjennomsiktig. Unntaket er når planlagt utbygging vises: da får skjulte klasser et lyst slør,
   så bakgrunnskartet dempes der og de mørke planfeltene synes tydelig også når de står alene. Fjerde tall er hvor tett fargen er. */
const SLOR = 0.82;
export const klassefarger = () => {
  const slor = app.planPaa && !ingenPlan() ? [...rgb('slor'), SLOR] : null;
  return ALLE.map(([id]) => (app.vis[id] ? rgb(id) : slor));
};
export function tilFarge(r, g, b, a, F) {
  if (!a) return [0, 0, 0, 0];
  const q = oppslag(r, g, b),
    A = F[LA[q]],
    B = F[LB[q]],
    t = LT[q] / 255,
    va = A ? t * (A[3] || 1) : 0,
    vb = B ? (1 - t) * (B[3] || 1) : 0,
    syn = va + vb;
  if (!(syn > 0)) return [0, 0, 0, 0];
  const f = [0, 0, 0, Math.round(a * syn)];
  for (let k = 0; k < 3; k++) f[k] = Math.round(((A ? A[k] * va : 0) + (B ? B[k] * vb : 0)) / syn);
  return f;
}
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function pngDel(type, data) {
  const o = new Uint8Array(data.length + 12),
    dv = new DataView(o.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) o[4 + i] = type.charCodeAt(i);
  o.set(data, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ o[i]) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return o;
}
export async function fargeleggBlob(buf) {
  const t0 = performance.now(),
    F = klassefarger(),
    u = new Uint8Array(buf),
    dv = new DataView(buf);
  let p = 8,
    plte = null,
    trns = null,
    type3 = false;
  const deler = [];
  while (p + 12 <= u.length) {
    const len = dv.getUint32(p),
      type = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]);
    if (type === 'IHDR') type3 = u[p + 17] === 3;
    if (type === 'PLTE') plte = [p + 8, len];
    else if (type === 'tRNS') trns = [p + 8, len];
    deler.push([type, p, len + 12]);
    p += len + 12;
  }
  if (!type3 || !plte) {
    /* uventet bildeformat: gå gjennom pikslene i stedet */
    const bm = await createImageBitmap(new Blob([buf])),
      c = document.createElement('canvas');
    c.width = bm.width;
    c.height = bm.height;
    const g = c.getContext('2d');
    g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height),
      o = d.data;
    for (let i = 0; i < o.length; i += 4) {
      const f = tilFarge(o[i], o[i + 1], o[i + 2], o[i + 3], F);
      o[i] = f[0];
      o[i + 1] = f[1];
      o[i + 2] = f[2];
      o[i + 3] = f[3];
    }
    g.putImageData(d, 0, 0);
    return new Promise(ok => c.toBlob(ok));
  }
  const n = plte[1] / 3,
    nyP = new Uint8Array(plte[1]),
    nyT = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const f = tilFarge(
      u[plte[0] + 3 * i],
      u[plte[0] + 3 * i + 1],
      u[plte[0] + 3 * i + 2],
      trns && i < trns[1] ? u[trns[0] + i] : 255,
      F
    );
    nyP[3 * i] = f[0];
    nyP[3 * i + 1] = f[1];
    nyP[3 * i + 2] = f[2];
    nyT[i] = f[3];
  }
  const ut = [u.subarray(0, 8)];
  deler.forEach(([type, pos, len]) => {
    if (type === 'PLTE') ut.push(pngDel('PLTE', nyP), pngDel('tRNS', nyT));
    else if (type !== 'tRNS') ut.push(u.subarray(pos, pos + len));
  });
  const blob = new Blob(ut, { type: 'image/png' });
  tidSlutt('kartfliser', t0);
  return blob;
}
