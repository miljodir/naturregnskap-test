/* Grunnkartet fra NIBIO som kartfliser, køen for kall, og hjelpere for lag som tegnes i nettleseren. */
/* Kartlaget: fliser fra NIBIO i et fast rutenett. Nettleseren beholder flisene den har hentet,
   så panorering og zoom tilbake til samme sted gir ingen nye kall, og fliser fra nabonivåene vises mens nye lastes. */
const klare = new Set(); /* fliser som er ferdig lastet og tegnes skarpt, som «nivå/x/y» */
let nyeKall = false,
  feilIVisning = false,
  iBevegelse = false;
const flisnett = new ol.tilegrid.TileGrid({
  origin: ORIGO,
  resolutions: OPPLOSNINGER,
  tileSize: 256,
  minZoom: FLISNIVA
});
function flisUrl(tc) {
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
/* Én henter per kilde: egen kø med høyst fire kall om gangen, eget minne for rå flisbilder
   (så fargebytte og skjuling ikke krever nye kall), og én linje i kall-loggen per runde. */
const hentere = [];
const opptatt = () => hentere.some(h => h.opptatt());
function lagHenter(kilde, hva) {
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
      $('siste').textContent = `Siste kall mot ${kilde}: ${fliser(runde.n)}, ${nf(ms / 1000)} s, ${kb(runde.bytes)}`;
    }
    if (runde.feil) {
      logg(kilde, `${hva}, ${fliser(runde.feil)}`, 0, 0, true);
      if (!runde.n) $('siste').textContent = `Kallet mot ${kilde} feilet.`;
    }
    $('laster').hidden = !opptatt();
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
    nyeKall = true;
    $('laster').hidden = false;
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
      feilIVisning = true;
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
const hentRaa = lagHenter('NIBIO', 'Kart'),
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
  new ol.source.XYZ({
    tileUrlFunction: flisUrl,
    tileGrid: flisnett,
    tilePixelRatio: 2,
    tileLoadFunction: lastFlis,
    transition: 0,
    projection: UTM
  });
const tema = new ol.layer.Tile({ className: 'tema', source: nyFlisKilde(), maxResolution: MAKSRES });
const plannett = new ol.tilegrid.TileGrid({ origin: ORIGO, resolutions: OPPLOSNINGER, tileSize: 256, minZoom: 5 });
function kommuneSti(g, geom, u, s) {
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
const lerret = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  return c;
};
/* Tegner et utsnitt av et bilde over hele flisen. Utsnittet klippes til bildet her, og målet krympes tilsvarende. Standarden sier at
   nettleseren skal gjøre det selv, men Safari har tegnet ingenting når utsnittet stikker utenfor bildet, og det gjør det for alle
   fliser langs kanten av kommunen når kartet er zoomet ut. */
function tegnUtsnitt(g, bilde, sx, sy, sw, sh) {
  const x0 = Math.max(0, sx),
    y0 = Math.max(0, sy),
    x1 = Math.min(bilde.width, sx + sw),
    y1 = Math.min(bilde.height, sy + sh);
  if (!(x1 > x0 && y1 > y0)) return;
  const fx = 512 / sw,
    fy = 512 / sh;
  g.drawImage(bilde, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * fx, (y0 - sy) * fy, (x1 - x0) * fx, (y1 - y0) * fy);
}
async function dagensKlasser(tc) {
  /* dagens klasser i flisens piksler, i de rene fargene fra NIBIO */
  const c = lerret(),
    g = c.getContext('2d', { willReadFrequently: true });
  if (tc[0] >= FLISNIVA) g.drawImage(await createImageBitmap(new Blob([await hentRaa(flisUrl(tc))])), 0, 0, 512, 512);
  else if (app.ov && app.ov.buf) {
    const u = plannett.getTileCoordExtent(tc);
    ovBilde = ovBilde || createImageBitmap(new Blob([app.ov.buf]));
    tegnUtsnitt(
      g,
      await ovBilde,
      (u[0] - app.ov.ext[0]) / ovRes,
      (app.ov.ext[3] - u[3]) / ovRes,
      (u[2] - u[0]) / ovRes,
      (u[3] - u[1]) / ovRes
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
/* Myker opp en maske litt, på stedet. Brukes for kommunebildene til inngrepsfri natur og grått areal. */
function jevn(P, w, h) {
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
const TOM = 4; /* OpenLayers' tilstand for en flis uten innhold */
/* Kilde for et lag som tegnes i nettleseren. Flisene har ingen adresse, bare plass i rutenettet. */
const tegnetKilde = tegnFlis =>
  new ol.source.XYZ({
    tileUrlFunction: tc => tc.join('/'),
    tileGrid: plannett,
    tilePixelRatio: 2,
    tileLoadFunction: tegnFlis,
    transition: 0,
    projection: UTM
  });
/* Tegner flisene i et lag på nytt. De gamle står til de nye er klare. */
let friskNr = 0;
const utdaterte = new Set();
const friskOpp = lag => {
  utdaterte.delete(lag);
  lag.getSource().setKey(String(++friskNr));
};
/* Zoomet ut tegnes inngrepsfri natur og grått areal oppå dagens klasser fra det sammensatte kartet. Fliser som ble tegnet før
   kartet fikk mer innhold, er derfor utdaterte. Lagene merkes når en ny flis legges inn, og tegnes på nytt neste gang kartet står
   stille zoomet ut med laget på. Uten dette ble de stående tomme når man zoomet inn, så seg rundt og zoomet ut igjen. */
function friskOppGamle() {
  if (iBevegelse || view.getResolution() < MAKSRES) return;
  for (const lag of [...utdaterte]) if (lag.getVisible()) friskOpp(lag);
}
const fargeleggFliser = () => {
  oversiktSynlig(true);
  klare.clear();
  tema.setSource(nyFlisKilde());
}; /* flisene tegnes på nytt fra de rå bildene, uten nye kall. Planlaget røres ikke: det avhenger ikke av hvilke klasser som vises. */
