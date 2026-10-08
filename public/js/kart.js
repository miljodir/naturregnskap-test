/* Selve kartet: bakgrunn, grense, klipping mot kommunen, status, måling og trykk i kartet. */
const bakgrunn = new ol.layer.Tile({
  className: 'bakgrunn',
  source: new ol.source.XYZ({
    projection: UTM,
    crossOrigin: 'anonymous',
    attributions: '© Kartverket, NIBIO, DiBK',
    tileGrid: new ol.tilegrid.TileGrid({ origin: ORIGO, resolutions: OPPLOSNINGER, tileSize: 256 }),
    tileUrlFunction: ([z, x, y]) =>
      `https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/utm33n/${String(z).padStart(2, '0')}/${y}/${x}.png`
  })
});
const grenseKilde = new ol.source.Vector();
const grense = new ol.layer.Vector({
  className: 'grense',
  source: grenseKilde,
  style: () => new ol.style.Style({ stroke: new ol.style.Stroke({ color: farge('ink'), width: 1.5 }) })
});
const view = new ol.View({
  projection: UTM,
  center: ol.proj.fromLonLat([15, 65], UTM),
  resolutions: OPPLOSNINGER.slice(2),
  resolution: OPPLOSNINGER[4],
  enableRotation: false
});
const kart = new ol.Map({
  target: 'kartflate',
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
    new ol.control.Zoom({ zoomInTipLabel: 'Zoom inn', zoomOutTipLabel: 'Zoom ut' }),
    new ol.control.ScaleLine(),
    new ol.control.Attribution({ collapsible: false })
  ]
});
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
    $('zoomet').hidden = !stor;
  };
  vv.addEventListener('resize', sjekk);
  vv.addEventListener('scroll', sjekk);
  sjekk();
}
/* Utenfor valgt kommune vises bare bakgrunnskartet: flisene klippes mot kommunens flate,
   hentes bare innenfor kommunens utstrekning, og slås først på når grensen er lastet. */
/* Der en flis er ferdig lastet, fjernes oversiktsbildet under den før flisen tegnes. Ellers ville det grove
   bildet stikke fram som en uskarp kant rundt alt som er gjennomsiktig i flisen, for eksempel langs sjøen. */
const dekket = ([z, x, y]) => {
  for (let d = 0; z - d >= FLISNIVA; d++) if (klare.has(`${z - d}/${x >> d}/${y >> d}`)) return true;
  return false;
};
tema.on('prerender', e => {
  const fs = e.frameState,
    res = fs.viewState.resolution;
  if (!app.ov || !oversiktLag.getVisible() || res >= MAKSRES) return;
  const c = e.context;
  flisnett.forEachTileCoord(fs.extent, flisnett.getZForResolution(res), tc => {
    if (!dekket(tc)) return;
    const u = flisnett.getTileCoordExtent(tc);
    const a = ol.render.getRenderPixel(e, kart.getPixelFromCoordinate([u[0], u[3]])),
      b = ol.render.getRenderPixel(e, kart.getPixelFromCoordinate([u[2], u[1]]));
    const x0 = Math.floor(a[0]),
      y0 = Math.floor(a[1]);
    c.clearRect(x0, y0, Math.ceil(b[0]) - x0, Math.ceil(b[1]) - y0);
  });
});

const klippStil = new ol.style.Style({ fill: new ol.style.Fill({ color: '#000' }) });
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
    vc = ol.render.getVectorContext(e);
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
klippSist(oversiktLag, [tema, inonLag, graaLag]);
klippSist(tema, [inonLag, graaLag]);
klippSist(inonLag, [graaLag]);
klippSist(graaLag, []);
[dekLag, ...flateLag, planLag, ...omrissLag].forEach((l, i, alle) =>
  klippSist(l, alle.slice(i + 1))
); /* disse deler lerret */
/* Oversiktsbildet ligger under flisene og vises mens nytt innhold lastes. Sammen med fliser nettleseren
   alt har fra andre zoomnivåer gjør det at kartet aldri står tomt. Når alle flisene i utsnittet er på plass, skjules det. */
function kartStatus() {
  if (view.getResolution() < MAKSRES) {
    $('ute').hidden = true;
    return;
  }
  const o = (app.ov && app.ov.ext) || (app.valgt && app.oversikter[app.valgt.nr]),
    treff = !!o && ol.extent.intersects(view.calculateExtent(kart.getSize()), o);
  oversiktSynlig(true);
  $('ute').hidden = treff || !app.valgt;
  $('siste').textContent = !treff
    ? ''
    : app.ov && app.ov.dynamisk
      ? 'Viser kart nettleseren allerede har hentet'
      : 'Viser lagret oversiktsbilde';
}
/* Måling til feilsøking: hvor jevnt kartet tegnes mens det flyttes, og hvor lang tid etterarbeidet tar. Vises under Tekniske valg. */
let maalRaf = 0,
  maalSist = 0,
  maalT = [],
  maalTekst = ['', ''],
  tegnT0 = 0;
const visMaaling = () => {
  const deler = Object.entries(bruk)
    .filter(([, b]) => b.sum >= 1)
    .sort((a, b) => b[1].sum - a[1].sum)
    .map(([navn, b]) => `${navn} ${Math.round(b.sum)} ms (${b.n} ganger, lengst ${Math.round(b.maks)} ms)`);
  $('maaling').textContent =
    [...maalTekst, deler.length ? `Tid brukt siden flyttingen startet: ${deler.join(', ')}.` : '']
      .filter(Boolean)
      .join(' ') || 'Flytt kartet for å måle hvor jevnt det går.';
};
kart.on('precompose', () => {
  tegnT0 = performance.now();
});
kart.on('postcompose', () => {
  if (tegnT0) tidSlutt('tegning', tegnT0);
});
setInterval(() => {
  if (!iBevegelse) visMaaling();
}, 1500);
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
$('versjon').textContent = `Utgave: ${VERSJON}.`;
kart.on('movestart', () => {
  iBevegelse = true;
  nyeKall = false;
  feilIVisning = false;
  oversiktSynlig(true);
  clearTimeout(etterTimer);
  cancelAnimationFrame(maalRaf);
  maalT = [];
  maalSist = 0;
  bruk = {};
  maalRaf = requestAnimationFrame(maalBilde);
});
kart.on('moveend', () => {
  iBevegelse = false;
  maalFerdig();
  kartStatus();
  kart.render();
  friskOppGamle();
  if (etterVenter) planleggEtterarbeid();
});
view.on('change:resolution', () => {
  if (view.getResolution() >= MAKSRES) {
    oversiktSynlig(true);
    fargeleggVentende(samle);
  }
});
kart.on('rendercomplete', () => {
  if (iBevegelse || view.getResolution() >= MAKSRES || !app.valgt || !tema.getVisible() || opptatt())
    return; /* aldri skjul oversikten midt i en bevegelse */
  if (!feilIVisning) oversiktSynlig(false);
  if (!nyeKall) $('siste').textContent = 'Ingen nye kall. Flisene lå allerede i nettleseren.';
});
/* Trykk på kartet: les fargen i punktet og finn klassen. */
/* Kartet som kommunevelger: et trykk utenfor valgt kommune slår opp kommunen i punktet hos Kartverket og viser en knapp
   rett over punktet, med en prikk der man trykket. Byttet skjer først når man trykker på knappen, så et bomtrykk ved grensen ikke bytter kommune.
   Knappen holdes innenfor kartflaten og unna zoomknappene, og følger punktet når kartet flyttes. */
const bytt = $('byttknapp'),
  prikk = document.createElement('div');
prikk.className = 'punkt';
const byttLag = new ol.Overlay({ element: prikk, positioning: 'center-center', stopEvent: false });
kart.addOverlay(byttLag);
let byttNr = null,
  byttSok = 0,
  byttKoord = null;
const lukkBytt = () => {
  byttSok++;
  byttNr = null;
  byttKoord = null;
  bytt.hidden = true;
  byttLag.setPosition(undefined);
};
function plasserBytt() {
  if (bytt.hidden || !byttKoord) return;
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
kart.on('postrender', plasserBytt);
bytt.addEventListener('click', () => {
  const nr = byttNr;
  lukkBytt();
  if (nr) velg(nr, true);
});
async function finnKommune(koord) {
  lukkBytt();
  const mitt = byttSok,
    p = $('probe');
  p.textContent = 'Slår opp kommunen …';
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
    byttNr = t[1].nr;
    bytt.textContent = `Bytt til ${t[1].navn}`;
    byttKoord = koord;
    bytt.hidden = false;
    byttLag.setPosition(koord);
    plasserBytt();
    p.innerHTML = 'Valgt punkt: <b></b>';
    p.firstElementChild.textContent = `${t[1].navn} kommune`;
  } catch (e) {
    if (mitt === byttSok) p.textContent = 'Fant ingen annen kommune her.';
  }
}
kart.on('singleclick', e => {
  if (tegner()) return; /* under tegning er trykk i kartet hjørner i området */
  const p = $('probe');
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
    p.innerHTML = 'Valgt punkt: <b></b>';
    p.firstElementChild.textContent =
      (av(rgb('pjor')) < av(rgb('pnat')) ? 'Jordbruk' : 'Natur') + ', satt av til framtidig utbygging' + iVern;
    return;
  }
  let d = tema.getVisible() ? tema.getData(e.pixel) : null;
  if ((!d || d[3] < 40) && app.ov && oversiktLag.getVisible()) d = oversiktLag.getData(e.pixel);
  if (!d || d[3] < 40) {
    p.textContent = 'Ingen synlig klasse her (skjult kartlag, eller kartet er ikke hentet).';
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
    p.textContent = 'Kartlaget for dette punktet er skjult.';
    return;
  }
  p.innerHTML = 'Valgt punkt: <b></b>';
  p.firstElementChild.textContent = best + iVern;
});
