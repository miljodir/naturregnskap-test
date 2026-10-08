/* Grunnkartet fra NIBIO som kartfliser, dagens klasser i en flis, og oppfrisking av lag som tegnes i nettleseren. */
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { WMS, UTM, FLISNIVA, MAKSRES, M, app, tidSlutt } from './felles.js';
import { flisnett, plannett, lerret, kommuneSti, tegnUtsnitt, lagHenter, utdaterte, friskOpp } from './nett.js';
import { SLD, fargeleggBlob } from './farger.js';
import { leggISamling, oversiktSynlig } from './oversikt.js';
import { view } from './kart.js';

/* Kartlaget: fliser fra NIBIO i et fast rutenett. Nettleseren beholder flisene den har hentet,
   så panorering og zoom tilbake til samme sted gir ingen nye kall, og fliser fra nabonivåene vises mens nye lastes. */
export const klare = new Set(); /* fliser som er ferdig lastet og tegnes skarpt, som «nivå/x/y» */
export function flisUrl(tc) {
  return (
    WMS +
    '?' +
    new URLSearchParams({
      service: 'WMS',
      version: '1.3.0',
      request: 'GetMap',
      layers: 'okosystemtype',
      styles: '',
      crs: UTM,
      bbox: flisnett
        .getTileCoordExtent(tc)
        .map(v => v.toFixed(2))
        .join(','),
      width: 512,
      height: 512,
      format: 'image/png; mode=8bit',
      transparent: 'true',
      sld_body: SLD
    })
  );
}
export const hentRaa = lagHenter('NIBIO', 'Kart'),
  hentPlan = lagHenter('DiBK', 'Kommuneplan');
function lastFlis(tile, src) {
  hentRaa(src)
    .then(buf => {
      leggISamling(tile.getTileCoord(), buf);
      return fargeleggBlob(buf);
    })
    .then(blob => {
      const img = tile.getImage(),
        url = URL.createObjectURL(blob);
      img.addEventListener(
        'load',
        () => {
          URL.revokeObjectURL(url);
          klare.add(tile.getTileCoord().join('/'));
        },
        { once: true }
      );
      img.src = url;
    })
    .catch(() => tile.setState(3));
}
const nyFlisKilde = () =>
  new XYZ({
    tileUrlFunction: flisUrl,
    tileGrid: flisnett,
    tilePixelRatio: 2,
    tileLoadFunction: lastFlis,
    transition: 0,
    projection: UTM
  });
export const tema = new TileLayer({ className: 'tema', source: nyFlisKilde(), maxResolution: MAKSRES });
export async function dagensKlasser(tc) {
  /* dagens klasser i flisens piksler, i de rene fargene fra NIBIO */
  const c = lerret(),
    g = c.getContext('2d', { willReadFrequently: true });
  if (tc[0] >= FLISNIVA) g.drawImage(await createImageBitmap(new Blob([await hentRaa(flisUrl(tc))])), 0, 0, 512, 512);
  else if (app.ov && app.ov.buf) {
    const u = plannett.getTileCoordExtent(tc);
    M.ovBilde = M.ovBilde || createImageBitmap(new Blob([app.ov.buf]));
    tegnUtsnitt(
      g,
      await M.ovBilde,
      (u[0] - app.ov.ext[0]) / M.ovRes,
      (app.ov.ext[3] - u[3]) / M.ovRes,
      (u[2] - u[0]) / M.ovRes,
      (u[3] - u[1]) / M.ovRes
    );
  } else if (app.ov && app.ov.lerret && app.klipp) {
    /* nettleserens eget oversiktsbilde: bare det som er hentet, og bare innenfor kommunen */
    const u = plannett.getTileCoordExtent(tc),
      r = (app.ov.ext[2] - app.ov.ext[0]) / app.ov.lerret.width,
      s = 512 / (u[2] - u[0]);
    tegnUtsnitt(
      g,
      app.ov.lerret,
      (u[0] - app.ov.ext[0]) / r,
      (app.ov.ext[3] - u[3]) / r,
      (u[2] - u[0]) / r,
      (u[3] - u[1]) / r
    );
    g.globalCompositeOperation = 'destination-in';
    kommuneSti(g, app.klipp, u, s);
    g.fill('evenodd');
    g.globalCompositeOperation = 'source-over';
  } else return null;
  const t0 = performance.now(),
    data = g.getImageData(0, 0, 512, 512).data;
  tidSlutt('dagens klasser', t0);
  return data;
}
/* Zoomet ut tegnes inngrepsfri natur og grått areal oppå dagens klasser fra det sammensatte kartet. Fliser som ble tegnet før
   kartet fikk mer innhold, er derfor utdaterte. Lagene merkes når en ny flis legges inn, og tegnes på nytt neste gang kartet står
   stille zoomet ut med laget på. Uten dette ble de stående tomme når man zoomet inn, så seg rundt og zoomet ut igjen. */
export function friskOppGamle() {
  if (M.iBevegelse || view.getResolution() < MAKSRES) return;
  for (const lag of [...utdaterte]) if (lag.getVisible()) friskOpp(lag);
}
export const fargeleggFliser = () => {
  oversiktSynlig(true);
  klare.clear();
  tema.setSource(nyFlisKilde());
}; /* flisene tegnes på nytt fra de rå bildene, uten nye kall. Planlaget røres ikke: det avhenger ikke av hvilke klasser som vises. */
