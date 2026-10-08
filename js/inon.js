/* Inngrepsfri natur (INON) fra Miljødirektoratet: natur som ligger minst én kilometer fra tyngre tekniske inngrep, delt i tre soner
   etter avstand. Sonene hentes som ett bilde av hele kommunen når kommunen velges, og huskes så lenge siden er åpen. Kartflisene
   lages av det bildet i nettleseren, så laget gir ingen flere kall når kartet flyttes eller zoomes. Nettleseren legger sonene oppå
   dagens klasser og fargelegger bare det som er natur, i tre mørkere grønntoner. Natur utenfor sonene beholder den vanlige grønnfargen.
   Laget deler lerret med klassene, så det får samme gjennomsiktighet og ser ut som en del av naturfargen. */
const INON = 'https://kart.miljodirektoratet.no/geoserver/inngrepsfrinatur/wms';
const INONSONER = [
  /* kode i tjenesten, farge her, farge i tjenestens bilder, avstand, navn */
  ['v', 'inonv', [76, 171, 38], '5 km eller mer fra inngrep', 'Villmarkspreget natur'],
  ['1', 'inon1', [153, 207, 22], '3–5 km fra inngrep', 'Sone 1'],
  ['2', 'inon2', [204, 234, 127], '1–3 km fra inngrep', 'Sone 2']
];
const inonSone = (r, g, b) => {
  let best = 0,
    min = 1e9;
  for (let i = 0; i < 3; i++) {
    const f = INONSONER[i][2],
      d = (r - f[0]) ** 2 + (g - f[1]) ** 2 + (b - f[2]) ** 2;
    if (d < min) {
      min = d;
      best = i;
    }
  }
  return best;
};
const inonBilde = (u, w, h) =>
  INON +
  '?' +
  new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: 'status',
    styles: '',
    crs: UTM,
    bbox: u.map(v => v.toFixed(2)).join(','),
    width: w,
    height: h,
    format: 'image/png8',
    transparent: 'true',
    format_options: 'antialias:none'
  });
let inonRad = null;
/* Kommunebildet er gjort om til tre masker i hver sin fargekanal: minst 1 km, minst 3 km og minst 5 km fra inngrep. Når en flis
   forstørres fra bildet, jevner nettleseren ut hver maske for seg, og grensen settes der masken er halvveis. Sonegrensene blir
   dermed glatte kurver også når kartet er zoomet langt inn, selv om bildet har ruter på 20 meter eller mer. */
async function lastInonFlis(tile) {
  try {
    const D =
        app.inon && app.valgt && app.inon.nr === app.valgt.nr && app.inon.tilstand === 'ok' && app.inon.c
          ? app.inon
          : null,
      tc = tile.getTileCoord(),
      u = plannett.getTileCoordExtent(tc);
    if (!D || !ol.extent.intersects(u, D.u)) {
      tile.setState(TOM);
      return;
    }
    const c = lerret(),
      g = c.getContext('2d', { willReadFrequently: true }),
      t0 = performance.now();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    tegnUtsnitt(g, D.c, (u[0] - D.u[0]) / D.res, (D.u[3] - u[3]) / D.res, (u[2] - u[0]) / D.res, (u[3] - u[1]) / D.res);
    const P = g.getImageData(0, 0, 512, 512).data;
    let noe = false;
    for (let i = 0; i < P.length; i += 4)
      if (P[i] >= 128 && P[i + 3] >= 128) {
        noe = true;
        break;
      }
    if (!noe) {
      tile.setState(TOM);
      return;
    } /* ingen inngrepsfri natur her: dagens klasser trengs ikke */
    const K = await dagensKlasser(tc);
    if (!K) {
      tile.setState(TOM);
      return;
    } /* klassene er ikke hentet ennå. Laget friskes opp når de er det. */
    const ut = g.createImageData(512, 512),
      o = ut.data,
      F = [rgb('inon2'), rgb('inon1'), rgb('inonv')];
    let tegnet = false;
    for (let i = 0; i < P.length; i += 4) {
      if (P[i] < 128 || P[i + 3] < 128 || K[i + 3] < 100 || klasseAv(K[i], K[i + 1], K[i + 2]) !== NAT) continue;
      const f = F[P[i + 2] >= 128 ? 2 : P[i + 1] >= 128 ? 1 : 0];
      o[i] = f[0];
      o[i + 1] = f[1];
      o[i + 2] = f[2];
      o[i + 3] = 255;
      tegnet = true;
    }
    if (!tegnet) {
      tile.setState(TOM);
      return;
    }
    g.putImageData(ut, 0, 0);
    tile.setImage(c);
    tidSlutt('inngrepsfri natur, fliser', t0);
  } catch (e) {
    tile.setState(3);
  }
}
const inonLag = new ol.layer.Tile({ className: 'tema', visible: false, source: tegnetKilde(lastInonFlis) });
/* Ett bilde av hele kommunen, med ruter på 20 meter eller opptil 2048 ruter på lengste side. Det gir både kartlaget og arealet per
   sone. Det ferdige resultatet huskes for de siste kommunene så lenge siden er åpen, så et nytt valg av samme kommune koster ingenting. */
const inonMinne = new Map();

/* Tolker bildet av sonene. P er bildet fra tjenesten og M kommunens flate, som piksler i samme rutenett. Gir arealet per sone i km²,
   og gjør samtidig P om til tre utjevnede masker i hver sin fargekanal, som kartlaget tegnes fra. Ren regning. */
function tolkInon(P, M, w, h, res, m2) {
  const n = [0, 0, 0];
  let forrige = -1,
    sone = 0;
  for (let i = 0; i < P.length; i += 4) {
    if (P[i + 3] < 128) {
      P[i] = P[i + 1] = P[i + 2] = 0;
      P[i + 3] = 255;
      continue;
    }
    const kode = (P[i] << 16) | (P[i + 1] << 8) | P[i + 2];
    if (kode !== forrige) {
      forrige = kode;
      sone = inonSone(P[i], P[i + 1], P[i + 2]);
    } /* 0 villmarkspreget, 1 sone 1, 2 sone 2 */
    if (M[i + 3] >= 128) n[sone]++;
    P[i] = 255;
    P[i + 1] = sone <= 1 ? 255 : 0;
    P[i + 2] = sone === 0 ? 255 : 0;
    P[i + 3] = 255;
  }
  jevn(P, w, h);
  jevn(P, w, h);
  const soner = n.map(v => Math.round(((v * res * res) / m2) * 100) / 100); /* nærmeste 10 dekar, som SSBs tall */
  return { soner, sum: Math.round((soner[0] + soner[1] + soner[2]) * 100) / 100 };
}
async function sjekkInon(k, geom, mitt) {
  const har = inonMinne.get(k.nr);
  if (har) {
    husk(inonMinne, k.nr, har, 3);
    app.inon = har;
    friskOpp(inonLag);
    visInon();
    return;
  }
  app.inon = { nr: k.nr, tilstand: 'henter' };
  visInon();
  try {
    const { res, w, h, u } = rutenett(geom.getExtent(), 2048, 20);
    const buf = await hent('Miljødirektoratet', `Inngrepsfri natur i ${k.navn}`, inonBilde(u, w, h), false, true);
    if (mitt !== valgNr) return;
    const t0 = performance.now(),
      a = tegneflate(w, h),
      b = tegneflate(w, h);
    a.drawImage(await createImageBitmap(new Blob([buf])), 0, 0, w, h);
    kommuneSti(b, geom, u, 1 / res);
    b.fill('evenodd');
    const bilde = a.getImageData(0, 0, w, h),
      tall = tolkInon(bilde.data, b.getImageData(0, 0, w, h).data, w, h, res, utm33(geom));
    a.putImageData(bilde, 0, 0);
    app.inon = { nr: k.nr, tilstand: 'ok', ...tall, c: a.canvas, u, res };
    husk(inonMinne, k.nr, app.inon, 3);
    tidSlutt('inngrepsfri natur, kommunebilde', t0);
  } catch (e) {
    if (mitt !== valgNr) return;
    app.inon = { nr: k.nr, tilstand: 'feil' };
  }
  friskOpp(inonLag);
  visInon();
}
function visInon() {
  const D = gjeldende(app.inon),
    ok = !!D && D.tilstand === 'ok',
    R = inonRad.rad,
    liste = $('inonliste'),
    tekst = $('inonsum'),
    merk = $('inonmerk'),
    har = ok && D.sum > 0;
  inonLag.setVisible(app.inonPaa && app.vis.nat && !!app.klipp && har);
  friskOppGamle();
  radTall(R, D, har);
  R.querySelector('.un').textContent = har ? 'krysses ikke med planlagt utbygging' : '';
  liste.textContent = merk.textContent = '';
  $('inonplan').hidden = !har;
  if (!D || D.tilstand === 'henter') {
    tekst.textContent = app.valgt ? 'Henter …' : '';
    return;
  }
  if (!ok) {
    tekst.textContent = 'Inngrepsfri natur kunne ikke hentes fra Miljødirektoratet.';
    return;
  }
  if (!har) {
    tekst.textContent =
      'Kommunen har ingen inngrepsfri natur: alt ligger nærmere enn én kilometer fra tyngre tekniske inngrep, som veier, kraftlinjer og regulerte vassdrag.';
    return;
  }
  tekst.textContent = `Ca. ${iTekst(D.sum)} av kommunen${app.ssbSum ? `, ${nf((D.sum / app.ssbSum) * 100)} % av landarealet,` : ''} ligger minst én kilometer fra tyngre tekniske inngrep, som veier, kraftlinjer og regulerte vassdrag.`;
  merk.textContent = !app.vis.nat
    ? 'Laget følger klassen natur, som er slått av i kartet nå.'
    : app.inonPaa
      ? 'I kartet vises naturen nå i fire grønntoner:'
      : 'Når laget er på, vises naturen i kartet i fire grønntoner:';
  fargelinje(liste, 'nat', 'Annen natur', '', 'Nærmere enn 1 km fra inngrep');
  [2, 1, 0].forEach(i => fargelinje(liste, INONSONER[i][1], INONSONER[i][4], dekar(D.soner[i]), INONSONER[i][3]));
}
