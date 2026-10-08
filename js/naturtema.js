/* Naturtema fra Miljødirektoratet: verneområder, villrein og verdsatt natur, med rad, kartlag og kryssing mot planen. */
/* Naturlag fra Miljødirektoratet: verneområder og leveområder for villrein. Tjenestene gir selve flatene med navn og opplysninger,
   ikke bare et bilde. Hvert datasett blir et kartlag med egen knapp og egen del i tallpanelet, og krysses med planlagt utbygging.
   Et nytt datasett av samme slag legges til som en ny linje i listen under. */
const MD = 'https://kart.miljodirektoratet.no/arcgis/rest/services/';
/* Én rad per naturtema, bygd likt: fargeruten viser temaet i kartet, og resten av raden åpner detaljene. Raden svarer på det samme
   for alle temaene: hvor mye som finnes i kommunen, hvor stor del av landarealet det er, og hvor mye planlagt utbygging som ligger innenfor. */
function temaRad(id, navn, klasse, vedBryter) {
  const rad = document.createElement('div');
  rad.className = 'row naturrad ' + klasse;
  rad.style.setProperty('--c', `var(--${id})`);
  rad.innerHTML = `<button type="button" class="lagknapp" id="${id}knapp" aria-pressed="false"><span class="sw"></span></button><button type="button" class="apne" id="${id}apne" aria-expanded="false" aria-controls="${id}blokk"><span class="nm"></span><span class="km"></span><span class="pc"></span><span class="un"></span><span class="mer">Detaljer</span></button>`;
  const knapp = rad.firstChild,
    apne = rad.lastChild,
    blokk = document.createElement('div');
  blokk.className = 'naturblokk';
  blokk.id = id + 'blokk';
  blokk.hidden = true;
  blokk.setAttribute('role', 'region');
  blokk.setAttribute('aria-label', navn);
  knapp.setAttribute('aria-label', `Vis ${navn.toLowerCase()} i kartet`);
  apne.querySelector('.nm').textContent = navn;
  knapp.addEventListener('click', () => vedBryter(knapp));
  apne.addEventListener('click', () => {
    const ap = apne.getAttribute('aria-expanded') !== 'true';
    apne.setAttribute('aria-expanded', String(ap));
    apne.querySelector('.mer').textContent = ap ? 'Skjul' : 'Detaljer';
    blokk.hidden = !ap;
    rad.classList.toggle('apen', ap);
  });
  return { rad, knapp, blokk };
}
const andelTekst = p => (p > 0 && p < 0.1 ? '< 0,1 %' : nf(p) + ' %');
/* Tallene i raden for et tema som hentes som ett bilde av kommunen: areal og andel av landarealet, eller hvorfor de mangler. */
function radTall(rad, D, har) {
  rad.querySelector('.km').textContent =
    !D || D.tilstand === 'henter' ? '' : D.tilstand === 'feil' ? 'ikke hentet' : har ? dekar(D.sum) : 'ingen';
  rad.querySelector('.pc').textContent = har && app.ssbSum ? andelTekst((D.sum / app.ssbSum) * 100) : '';
}
/* En linje i en tegnforklaring: fargerute og navn, tall til høyre, og en forklaring under hvis det er oppgitt. */
function fargelinje(liste, id, navn, tall, under) {
  const li = document.createElement('li'),
    n = document.createElement('b'),
    i = document.createElement('i'),
    ar = document.createElement('span');
  i.style.setProperty('--c', `var(--${id})`);
  n.append(i, navn);
  ar.textContent = tall;
  li.append(n, ar);
  if (under) {
    const sm = document.createElement('small');
    sm.textContent = under;
    li.appendChild(sm);
  }
  liste.appendChild(li);
  return li;
}
const NATURLAG = [
  {
    id: 'vern',
    navn: 'Verneområder',
    en: 'verneområde',
    fl: 'verneområder',
    best: 'verneområdene',
    vann: true,
    url: MD + 'vern/MapServer/0/query',
    felt: 'offisieltNavn,verneform,vernedato,faktaark',
    slakk: 5,
    kildetekst: 'Miljødirektoratet, naturvernområder',
    les: p => ({
      navn: p.offisieltNavn || 'Uten navn',
      url: p.faktaark || '',
      under: [
        String(p.verneform || '')
          .replace(/([a-zæøå])([A-ZÆØÅ])/g, '$1 $2')
          .toLowerCase()
          .replace(/omraade/g, 'område')
          .replace(/^./, c => c.toUpperCase()),
        p.vernedato ? 'vernet ' + new Date(p.vernedato).getUTCFullYear() : ''
      ]
        .filter(Boolean)
        .join(', ')
    })
  },
  {
    id: 'rein',
    navn: 'Villrein',
    en: 'villreinområde',
    fl: 'villreinområder',
    best: 'villreinområdene',
    url: MD + 'villrein/MapServer/1/query',
    felt: '*',
    slakk: 20,
    kildetekst: 'Miljødirektoratet, leveområder for villrein',
    les: p => ({
      navn: String(p['villreinområdeNavn'] || 'Uten navn').replace(/\s*-\s*leveområde\s*$/i, ''),
      url: p.faktaark || '',
      under: [
        p['villreinområdeNasjonalt'] === 'Ja' ? 'Nasjonalt villreinområde' : 'Villreinområde',
        p.funksjon ? String(p.funksjon).toLowerCase() : '',
        p.funksjonsperiode ? String(p.funksjonsperiode).toLowerCase() : ''
      ]
        .filter(Boolean)
        .join(', ')
    })
  },
  /* Naturtyper med verdi etter Miljødirektoratets fire verdikategorier. Det er mange små lokaliteter, så de tegnes fylt og uten hvit
     kant, i fire toner av samme farge: mørkere jo høyere verdi. I tallpanelet listes bare lokalitetene som berøres av planlagt utbygging.
     Dekningskartet viser hvor det er kartlagt. Det som ikke er kartlagt, kan få et lyst slør i kartet. */
  {
    id: 'verdi',
    navn: 'Verdsatt natur',
    en: 'verdsatt lokalitet',
    fl: 'verdsatte lokaliteter',
    best: 'lokalitetene',
    samlet: true,
    flate: true,
    avLand: true,
    dekning: true,
    klasser: [
      ['Svært stor verdi', 'verdi1'],
      ['Stor verdi', 'verdi2'],
      ['Middels verdi', 'verdi3'],
      ['Noe verdi', 'verdi4']
    ],
    url: MD + 'naturtyper_kuverdi/MapServer/0/query',
    hvor: nr =>
      `Verdikategori IN ('Svært stor verdi','Stor verdi','Middels verdi','Noe verdi') AND Kommune LIKE '%(${nr})%'`,
    felt: 'Verdikategori,Naturtype,Områdenavn,FaktaarkLokalitet,Faktaark',
    slakk: 5,
    kildetekst: 'Miljødirektoratet, naturtyper med KU-verdi og dekningskart for naturtypekartlegging',
    ekstra: hentDekning,
    les: p => ({
      navn: p['Områdenavn'] || p.Naturtype || 'Uten navn',
      url: p.FaktaarkLokalitet || p.Faktaark || '',
      v: Math.max(0, ['Svært stor verdi', 'Stor verdi', 'Middels verdi', 'Noe verdi'].indexOf(p.Verdikategori)),
      under: [p.Naturtype, String(p.Verdikategori || '').toLowerCase()].filter(Boolean).join(', ')
    })
  }
].map(t => {
  t.kilde = new ol.source.Vector();
  t.minne = new Map();
  t.data = null;
  t.paa = false; /* naturlagene er av når siden åpnes, så kartet starter enkelt */
  /* Bare omriss: en hvit kant og en farget strek. En fylling over hele området måtte tegnes på nytt i hvert bilde når kartet flyttes.
     Laget deler lerret med planlaget, så de klippes samlet. Den store bufferen gjør at alle omrissene i kommunen tegnes i ett, også de
     utenfor utsnittet, så de er på plass mens kartet flyttes. */
  /* Fylte flater tegnes om til kartfliser i nettleseren, slik planlaget gjør. Tusen små flater som vektor måtte tegnes på nytt i hvert
     bilde når kartet flyttes. Som fliser tegnes de én gang og flyttes som bilder. */
  /* Et område som er mindre enn noen få piksler i kartet, for eksempel et fredet tre, tegnes som en liten ring med fast størrelse.
     Som omriss ville det blinket når kartet flyttes: havner alle punktene i samme piksel, blir streken null lang og tegnes ikke. */
  const midt = f => f.midt || (f.midt = new ol.geom.Point(ol.extent.getCenter(f.getGeometry().getExtent())));
  t.strek = [
    new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,.92)', width: 6 }) }),
    new ol.style.Style({ stroke: new ol.style.Stroke({ color: farge(t.id), width: 2.75 }) })
  ];
  t.merke = [
    new ol.style.Style({
      geometry: midt,
      image: new ol.style.Circle({ radius: 7, fill: new ol.style.Fill({ color: 'rgba(255,255,255,.92)' }) })
    }),
    new ol.style.Style({
      geometry: midt,
      image: new ol.style.Circle({ radius: 4, stroke: new ol.style.Stroke({ color: farge(t.id), width: 2.75 }) })
    })
  ];
  t.lag = t.flate
    ? new ol.layer.Tile({ className: 'plan', visible: false, source: tegnetKilde(tile => tegnFlateflis(t, tile)) })
    : new ol.layer.Vector({
        className: 'plan',
        source: t.kilde,
        visible: false,
        renderBuffer: 4000,
        style: (f, res) => {
          const u = f.getGeometry().getExtent();
          return Math.max(u[2] - u[0], u[3] - u[1]) < 8 * res ? t.merke : t.strek;
        }
      });
  const r = temaRad(t.id, t.navn, t.flate ? 'flate' : '', k => {
    t.paa = !t.paa;
    k.setAttribute('aria-pressed', String(t.paa));
    if (!t.paa && app.vist && app.vist.t === t) fjernMerket();
    visNatur(t);
  });
  t.rad = r.rad;
  t.knapp = r.knapp;
  const b = (t.blokk = r.blokk);
  b.innerHTML = `<p id="${t.id}sum"></p><ul id="${t.id}tegn"></ul><div id="${t.id}helhet" class="helhet" hidden></div><p id="${t.id}merk"></p>${t.dekning ? `<label class="valg" for="${t.id}slor" hidden><input type="checkbox" id="${t.id}slor" checked>Legg et lyst slør over det som ikke er kartlagt, når laget er på.</label>` : ''}<p id="${t.id}plan" role="status"></p><p id="${t.id}gap" role="status"></p><ul id="${t.id}liste"></ul><p class="hint"></p>`;
  b.querySelector('.hint').textContent =
    `Kilde: ${t.kildetekst}. Arealet gjelder den delen av hvert område som ligger i kommunen, og er regnet ut i nettleseren.${t.vann ? ' Verneområder kan også ligge i sjø og innsjøer, så andelen av landarealet er et omtrentlig mål.' : ''}`;
  if (t.dekning)
    b.querySelector('input').addEventListener('change', e => {
      app.slorPaa = e.target.checked;
      visNatur(t);
    });
  return t;
});
/* Slør over det som ikke er kartlagt: flisene fylles med en lys farge, og de kartlagte flatene stanses ut. Fliser uten noe kartlagt
   deler ett og samme bilde, så laget koster lite der hele flisen er ukjent. Laget ligger under naturflatene og planlaget. */
const dekKilde = new ol.source.Vector();
let heltSlor = null;
const slorFarge = () => `rgba(${rgb('slor').join(',')},.55)`;
function tegnSlorflis(tile) {
  const u = plannett.getTileCoordExtent(tile.getTileCoord()),
    fl = dekKilde.getFeaturesInExtent(u);
  if (!fl.length) {
    if (!heltSlor) {
      heltSlor = lerret();
      const g = heltSlor.getContext('2d');
      g.fillStyle = slorFarge();
      g.fillRect(0, 0, 512, 512);
    }
    tile.setImage(heltSlor);
    return;
  }
  const t0 = performance.now(),
    c = lerret(),
    g = c.getContext('2d'),
    s = 512 / (u[2] - u[0]);
  g.fillStyle = slorFarge();
  g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  for (const f of fl) {
    kommuneSti(g, f.getGeometry(), u, s);
    g.fill('evenodd');
  }
  tile.setImage(c);
  tidSlutt('slør, fliser', t0);
}
const dekLag = new ol.layer.Tile({ className: 'plan', visible: false, source: tegnetKilde(tegnSlorflis) });
function settDekning(t) {
  /* de kartlagte flatene for valgt kommune inn i sløret */
  const E = t.data && t.data.ekstra;
  dekKilde.clear();
  if (E && E.f) dekKilde.addFeatures(E.f);
  friskOpp(dekLag);
}
/* Rekkefølge i kartet: fylte flater ligger under planlaget, så planlagt utbygging oppå verdifull natur synes. Omriss ligger øverst. */
const flateLag = NATURLAG.filter(t => t.flate).map(t => t.lag),
  omrissLag = NATURLAG.filter(t => !t.flate).map(t => t.lag);
function naturMaske(g, kommune) {
  /* området som et lite rutenett med dekning per rute. kommune oppgis bare hvis flaten ikke alt er klippet. */
  const e = kommune ? ol.extent.getIntersection(g.getExtent(), kommune.getExtent()) : g.getExtent();
  if (ol.extent.isEmpty(e)) return null;
  const res = Math.max(10, Math.max(e[2] - e[0], e[3] - e[1]) / 1500),
    w = Math.ceil((e[2] - e[0]) / res) + 1,
    h = Math.ceil((e[3] - e[1]) / res) + 1,
    u = [e[0], e[3] - h * res, e[0] + w * res, e[3]];
  const k = tegneflate(w, h);
  kommuneSti(k, g, u, 1 / res);
  k.fill('evenodd');
  if (kommune) {
    k.globalCompositeOperation = 'destination-in';
    kommuneSti(k, kommune, u, 1 / res);
    k.fill('evenodd');
  }
  const d = k.getImageData(0, 0, w, h).data,
    a = new Uint8Array(w * h);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    a[i] = d[4 * i + 3];
    sum += a[i];
  }
  return { u, res, w, h, a, km2: ((sum / 255) * res * res) / 1e6 };
}
/* Hver flate klippes mot kommunegrensen én gang, og resultatet huskes så lenge siden er åpen: navn, opplysninger, areal i kommunen,
   den klippede flaten og maskene. Velges kommunen igjen, trengs verken kall mot Miljødirektoratet eller ny utregning. */
function klippNatur(t, j, geom) {
  const kom = flater(geom),
    m2 = utm33(geom);
  return j.features
    .map(f => {
      const g = f.geometry;
      if (!g || !g.coordinates) return null;
      const hele = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
      let koord = null,
        uklippet = false,
        km2;
      try {
        koord = polygonClipping.intersection(hele, kom);
      } catch (e) {
        koord = null;
      }
      if (koord) {
        if (!koord.length) return null;
        km2 = new ol.geom.MultiPolygon(koord).getArea() / m2;
      } else {
        koord = hele;
        uklippet = true;
        const m = naturMaske(new ol.geom.MultiPolygon(hele), geom);
        if (!m || !(m.km2 > 0)) return null;
        km2 = m.km2;
      } /* klippingen feilet: flaten klippes i kartet i stedet */
      return km2 > 0 ? { koord, uklippet, km2, ...t.les(f.properties || {}) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.km2 - a.km2);
}
function tegnFlateflis(t, tile) {
  /* enkeltflatene som berører flisen, tegnet tett og så gjort litt gjennomsiktige samlet, så overlapp ikke blir mørkere */
  const t0 = performance.now(),
    u = plannett.getTileCoordExtent(tile.getTileCoord()),
    fl = t.kilde.getFeaturesInExtent(u);
  if (!fl.length) {
    tile.setState(TOM);
    return;
  }
  const c = lerret(),
    g = c.getContext('2d'),
    s = 512 / (u[2] - u[0]);
  g.fillStyle = g.strokeStyle = farge(t.id);
  g.lineWidth = 1;
  g.lineJoin = 'round';
  if (t.klasser)
    fl.sort(
      (a, b) => b.get('v') - a.get('v')
    ); /* lavest verdi først, så den høyeste ligger øverst der lokaliteter overlapper */
  for (const f of fl) {
    if (t.klasser) {
      const v = f.get('v');
      g.fillStyle = farge(t.klasser[v][1]);
      g.strokeStyle = farge(t.klasser[Math.max(0, v - 1)][1]);
    }
    kommuneSti(g, f.getGeometry(), u, s);
    g.fill('evenodd');
    g.stroke();
  }
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = 'rgba(0,0,0,.82)';
  g.fillRect(0, 0, 512, 512);
  tile.setImage(c);
  tidSlutt(t.navn.toLowerCase() + ', fliser', t0);
}
/* Mange små flater som overlapper: arealet finnes ved å tegne dem i et rutenett over kommunen og summere dekningen i rutene.
   Én tegning per verdikategori, der alle flater med minst den verdien tegnes som én sammenhengende form og klippes mot kommunen.
   Forskjellen mellom tegningene gir arealet per kategori uten dobbeltelling: der lokaliteter overlapper, teller den høyeste verdien,
   slik kartet også viser det. Dette er mye raskere enn å slå sammen tusen flater geometrisk, som låste siden i opptil et sekund.
   Enkeltflatene beholdes for navn, liste og kryssing med planlagt utbygging. */
function klasseAreal(omrader, antall, geom, innenfor) {
  /* innenfor: en flate arealet også skal klippes mot, for eksempel det kartlagte */
  const m2 = utm33(geom),
    { res, w, h, u } = rutenett(geom.getExtent(), 1536, 10);
  const g = tegneflate(w, h),
    kum = [];
  const med = ring => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return a > 0;
  }; /* omløpsretning */
  for (let v = 0; v < antall && omrader.length; v++) {
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.beginPath();
    for (const o of omrader) {
      if ((o.v || 0) > v) continue;
      for (const flate of o.koord)
        flate.forEach((ring, nr) => {
          /* ytterkanter én vei og hull motsatt vei, så overlapp fylles og hull blir hull */
          const snu = med(ring) !== (nr === 0),
            n = ring.length;
          for (let i = 0; i < n; i++) {
            const q = ring[snu ? n - 1 - i : i],
              x = (q[0] - u[0]) / res,
              y = (u[3] - q[1]) / res;
            if (i) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.closePath();
        });
    }
    g.fill('nonzero');
    g.globalCompositeOperation = 'destination-in';
    kommuneSti(g, geom, u, 1 / res);
    g.fill('evenodd');
    if (innenfor) {
      kommuneSti(g, innenfor, u, 1 / res);
      g.fill('evenodd');
    }
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 3; i < d.length; i += 4) sum += d[i];
    kum.push(((sum / 255) * res * res) / m2);
  }
  return {
    klasser: Array.from({ length: antall }, (_, v) => Math.max(0, (kum[v] || 0) - (v ? kum[v - 1] || 0 : 0))),
    sum: kum.length ? kum[kum.length - 1] : 0
  };
}
function samleNatur(t, j, geom) {
  const m2 = utm33(geom),
    areal = k => (k && k.length ? new ol.geom.MultiPolygon(k).getArea() / m2 : 0);
  const omrader = j.features
    .filter(f => f.geometry && f.geometry.coordinates)
    .map(f => {
      const koord = flerflate(f.geometry);
      return { koord, uklippet: false, km2: areal(koord), ...t.les(f.properties || {}) };
    })
    .sort(
      (a, b) => (a.v || 0) - (b.v || 0) || b.km2 - a.km2
    ); /* høyest verdi først, så en planrute der lokaliteter overlapper regnes til den høyeste */
  const r = klasseAreal(omrader, t.klasser ? t.klasser.length : 1, geom);
  return { omrader, klasser: t.klasser ? r.klasser : null, sum: r.sum };
}
/* Kartleggingsgrad: hvor stor del av kommunen som er kartlagt etter Miljødirektoratets instruks. Uten den er «ingen registrert» lett å misforstå. */
async function hentDekning(k, geom) {
  const j = await hent(
    'Miljødirektoratet',
    `Kartlagt område i ${k.navn}`,
    MD +
      'naturtyper_nin/MapServer/1/query?' +
      new URLSearchParams({
        where: '1=1',
        geometry: geom
          .getExtent()
          .map(v => Math.round(v))
          .join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: 25833,
        outSR: 25833,
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'Årstall',
        maxAllowableOffset: 10,
        geometryPrecision: 0,
        f: 'geojson'
      })
  );
  const fl = (j.features || []).filter(f => f.geometry && f.geometry.coordinates);
  if (!fl.length) return { km2: 0 };
  const kom = flater(geom),
    u = polygonClipping.intersection(polygonClipping.union(...fl.map(f => flerflate(f.geometry))), kom);
  const aar = fl.map(f => parseInt((f.properties || {})['Årstall'], 10)).filter(v => v > 1900);
  return {
    km2: u.length ? new ol.geom.MultiPolygon(u).getArea() / utm33(geom) : 0,
    fra: aar.length ? Math.min(...aar) : null,
    til: aar.length ? Math.max(...aar) : null,
    flate: u,
    f: u.map(p => new ol.Feature(new ol.geom.Polygon(p))),
    maske: null
  };
}
async function hentNatur(t, k, geom, mitt) {
  t.data = null;
  t.kilde.clear();
  if (t.flate) friskOpp(t.lag);
  if (t.dekning) settDekning(t);
  visNatur(t);
  try {
    let pakke = t.minne.get(k.nr);
    if (!pakke) {
      const j = await hent(
        'Miljødirektoratet',
        `${t.navn} i ${k.navn}`,
        t.url +
          '?' +
          new URLSearchParams({
            where: t.hvor ? t.hvor(k.nr) : `kommune LIKE '%(${k.nr})%'`,
            outFields: t.felt,
            outSR: 25833,
            maxAllowableOffset: t.slakk,
            geometryPrecision: 0,
            f: 'geojson'
          })
      );
      if (mitt !== valgNr) return;
      if (!j || !Array.isArray(j.features)) throw new Error('uventet svar');
      const med = o => {
        const g = new ol.geom.MultiPolygon(o.koord);
        return {
          ...o,
          f: new ol.Feature({ geometry: g, navn: o.navn, v: o.v || 0 }),
          ext: g.getExtent(),
          maske: null,
          plan: 0,
          smal: 0
        };
      };
      if (t.samlet) {
        const r = samleNatur(t, j, geom),
          omrader = r.omrader.map(med);
        pakke = {
          omrader,
          sum: r.sum,
          klasser: r.klasser,
          vis: omrader.map(o => o.f),
          ufullstendig: !!j.exceededTransferLimit
        };
      } else {
        const omrader = klippNatur(t, j, geom).map(med);
        pakke = { omrader, sum: omrader.reduce((s, o) => s + o.km2, 0), vis: omrader.map(o => o.f) };
      }
      husk(t.minne, k.nr, pakke, 30);
    }
    t.data = { nr: k.nr, ...pakke, pakke };
    t.kilde.addFeatures(pakke.vis);
    if (t.flate) friskOpp(t.lag);
    if (t.dekning) settDekning(t);
    if (t.ekstra && pakke.ekstra === undefined) {
      pakke.ekstra = null;
      t.ekstra(k, geom)
        .then(v => {
          if (t.klasser && v && v.flate && v.flate.length)
            try {
              v.inne = klasseAreal(pakke.omrader, t.klasser.length, geom, new ol.geom.MultiPolygon(v.flate)).klasser;
            } catch (e) {}
          pakke.ekstra = v;
          if (t.data && t.data.pakke === pakke) {
            t.data.ekstra = v;
            if (t.dekning) settDekning(t);
            regnNatur(t);
          }
        })
        .catch(() => {});
    }
  } catch (e) {
    if (mitt !== valgNr) return;
    t.data = { nr: k.nr, feil: true, omrader: [], sum: 0 };
  }
  regnNatur(t);
}
/* Påvirkning: hver rute med planlagt utbygging (21 meter) slås opp i maskene. Ruter i smale striper telles for seg. */
function kryssNatur(D, R, nK, medDekning, kommune) {
  /* D: områdene i temaet. R: rutenettet for planen. nK: antall verdiklasser. kommune: flaten uklippede områder klippes mot.
     Ren regning: gir tallene tilbake. Det eneste den endrer, er maskene, som lages første gang de trengs og huskes. */
  const B = R.basis || null,
    nE = R.eget ? R.antallEgne : 0,
    O = D.omrader;
  const tom = () => ({ alt: new Int32Array(nK), eg: Array.from({ length: nE }, () => new Int32Array(nK)) }),
    S = tom(),
    P = tom(); /* S: med egne områder. P: kommuneplanen alene. */
  const plan = new Int32Array(O.length),
    smal = new Int32Array(O.length);
  const m = OPPLOSNINGER[R.z] / 2,
    X = i => ORIGO[0] + (R.cx0 + (i % R.w) + 0.5) * m,
    Y = i => ORIGO[1] - (R.cy0 + Math.floor(i / R.w) + 0.5) * m,
    fjernet = i => B.ryddet[i] && R.alle[i] !== 1 && R.alle[i] !== 2; /* i planen, tatt ut av et eget område */
  if (O.length) {
    const treff = i => {
      /* nummeret til området ruta ligger i, eller -1 */
      const x = X(i),
        y = Y(i);
      for (let a = 0; a < O.length; a++) {
        const o = O[a];
        if (x < o.ext[0] || x > o.ext[2] || y < o.ext[1] || y > o.ext[3]) continue;
        const M = o.maske || (o.maske = naturMaske(o.f.getGeometry(), o.uklippet ? kommune : null));
        if (!M) continue; /* masken lages først når en planrute ligger i nærheten */
        const px = Math.floor((x - M.u[0]) / M.res),
          py = Math.floor((M.u[3] - y) / M.res);
        if (px < 0 || py < 0 || px >= M.w || py >= M.h || M.a[py * M.w + px] < 128) continue;
        return a;
      }
      return -1;
    };
    for (const i of R.celler) {
      const a = treff(i);
      if (a < 0) continue;
      const v = O[a].v || 0,
        e = nE ? R.eget[i] : 0;
      if (R.ryddet[i]) {
        plan[a]++;
        S.alt[v]++;
        if (e) S.eg[e - 1][v]++;
      } else smal[a]++;
      if (B && B.ryddet[i]) {
        P.alt[v]++;
        if (e) P.eg[e - 1][v]++;
      }
    }
    if (B)
      for (const i of B.celler) {
        if (!fjernet(i)) continue;
        const a = treff(i);
        if (a < 0) continue;
        const v = O[a].v || 0,
          e = R.eget[i];
        P.alt[v]++;
        if (e) P.eg[e - 1][v]++;
      }
  }
  let gap = null;
  if (medDekning && D.ekstra) {
    /* ruter med planlagt utbygging på natur, uten smale striper, delt på kartlagt og ikke kartlagt */
    const E = D.ekstra,
      M = E.flate && E.flate.length ? E.maske || (E.maske = naturMaske(new ol.geom.MultiPolygon(E.flate), null)) : null;
    const ukjentRute = i => {
      if (!M) return true;
      const px = Math.floor((X(i) - M.u[0]) / M.res),
        py = Math.floor((M.u[3] - Y(i)) / M.res);
      return px < 0 || py < 0 || px >= M.w || py >= M.h || M.a[py * M.w + px] < 128;
    };
    const ny = () => ({ nat: 0, ukjent: 0, eg: Array.from({ length: nE }, () => ({ nat: 0, ukjent: 0 })) }),
      G = ny(),
      GP = ny();
    const tell = (T, i, uk) => {
      const e = nE ? R.eget[i] : 0;
      T.nat++;
      if (uk) T.ukjent++;
      if (e) {
        T.eg[e - 1].nat++;
        if (uk) T.eg[e - 1].ukjent++;
      }
    };
    for (const i of R.celler) {
      const s = R.ryddet[i] === 1,
        b = !!B && B.ryddet[i] === 1;
      if (!s && !b) continue;
      const uk = ukjentRute(i);
      if (s) tell(G, i, uk);
      if (b) tell(GP, i, uk);
    }
    if (B) for (const i of B.celler) if (B.ryddet[i] === 1 && fjernet(i)) tell(GP, i, ukjentRute(i));
    gap = { nat: G.nat, ukjent: G.ukjent, eg: G.eg, plan: B ? GP : null };
  }
  return { kryss: { S, P: B ? P : null }, gap, plan, smal };
}
function regnNatur(t) {
  /* samordner: krysser temaet med planen hvis den er regnet ut, legger tallene i temaets data og ber om ny tegning */
  const D = t.data;
  if (!D || !app.valgt || D.nr !== app.valgt.nr) return visNatur(t);
  const R = app.planRaster && app.planRaster.nr === app.valgt.nr && !utenPlan() ? app.planRaster : null,
    t0 = performance.now();
  const r = R ? kryssNatur(D, R, t.klasser ? t.klasser.length : 1, !!t.dekning, app.klipp) : null;
  D.omrader.forEach((o, a) => {
    o.plan = r ? r.plan[a] : 0;
    o.smal = r ? r.smal[a] : 0;
  });
  D.regnet = !!R;
  D.kryss = r ? r.kryss : null;
  D.gap = r ? r.gap : null;
  visNatur(t);
  visEgne();
  tidSlutt(t.navn.toLowerCase(), t0);
}
/* Tallene som vises for et naturtema, regnet ut fra områdene. D er temaets data, klasser verdiklassene hvis temaet har det,
   medDekning om temaet har kartleggingsgrad, samlet om bare berørte områder skal listes, og land landarealet i km². Ren regning. */
function byggNaturTall(D, klasser, medDekning, samlet, land) {
  const o = D.omrader,
    E = D.ekstra;
  /* per verdiklasse: antall lokaliteter og ruter med planlagt utbygging */
  const perKlasse =
    klasser && D.klasser && o.length
      ? klasser.map((_, v) => {
          const av = o.filter(x => x.v === v);
          return { antall: av.length, plan: av.reduce((s, x) => s + x.plan, 0) };
        })
      : null;
  /* Helhetsbildet: landarealet L delt i kartlagt K og ikke kartlagt U, og verdsatt natur per verdi innenfor og utenfor det kartlagte. */
  let helhet = null;
  if (medDekning && E && E.km2 > 0 && E.inne && D.klasser && land > 0 && o.length > 0) {
    const L = land,
      K = Math.min(E.km2, L),
      U = Math.max(0, L - K),
      inne = E.inne,
      ute = D.klasser.map((a, v) => Math.max(0, a - inne[v]));
    helhet = { L, K, U, inne, ute, si: inne.reduce((a, b) => a + b, 0), su: ute.reduce((a, b) => a + b, 0) };
  }
  return {
    klasser: perKlasse,
    helhet,
    plan: o.reduce((s, x) => s + x.plan, 0),
    smal: o.reduce((s, x) => s + x.smal, 0),
    berort: o.filter(x => x.plan)
      .length /* ruter med planlagt utbygging, ruter i smale striper og antall områder som berøres */,
    vises: samlet
      ? o.filter(x => x.plan).sort((a, b) => b.plan - a.plan)
      : o /* av mange små lokaliteter listes bare de som berøres */
  };
}
function visNatur(t) {
  const D = t.data,
    ok = !!D && !!app.valgt && D.nr === app.valgt.nr,
    o = ok ? D.omrader : [],
    sum = ok ? D.sum || 0 : 0,
    km = dekar;
  const daa = n => iTekst((n * (OPPLOSNINGER[9] / 2) ** 2) / 1e6),
    el = n => $(t.id + n); /* fra antall ruter på 21 meter, brukes i setninger */
  t.lag.setVisible(t.paa && !!app.klipp && ok && o.length > 0);
  if (t.dekning) {
    const kartlagt = ok && !!D.ekstra && D.ekstra.km2 > 0;
    dekLag.setVisible(t.paa && app.slorPaa && !!app.klipp && kartlagt);
    t.blokk.querySelector('label').hidden = !kartlagt;
    el('tegn').textContent = el('gap').textContent = '';
  }
  const rad = n => t.rad.querySelector('.' + n),
    liste = el('liste');
  liste.textContent = '';
  rad('km').textContent = !ok ? '' : D.feil ? 'ikke hentet' : o.length ? km(sum) : 'ingen';
  rad('pc').textContent = ok && !D.feil && o.length && app.ssbSum ? andelTekst((sum / app.ssbSum) * 100) : '';
  rad('un').textContent = '';
  if (!ok) {
    el('sum').textContent = app.valgt ? 'Henter …' : '';
    ['tegn', 'merk', 'plan', 'gap'].forEach(n => {
      el(n).textContent = '';
    });
    el('helhet').hidden = true;
    return;
  }
  const N = byggNaturTall(D, t.klasser, !!t.dekning, !!t.samlet, app.ssbSum);
  el('sum').textContent = D.feil
    ? `${t.navn} kunne ikke hentes fra Miljødirektoratet.`
    : !o.length
      ? `Miljødirektoratet har ingen ${t.fl} registrert i kommunen.`
      : `${nf(o.length, 0)} ${o.length === 1 ? t.en + ' dekker' : t.fl + ' dekker'} ca. ${iTekst(sum)} av kommunen${app.ssbSum ? `, ${nf((sum / app.ssbSum) * 100)} % av landarealet` : ''}.${D.ufullstendig ? ' Tjenesten ga ikke alle lokalitetene i ett svar, så tallet er for lavt.' : ''}${t.klasser && D.klasser && o.length ? ` Ca. ${iTekst(D.klasser[0] + D.klasser[1])} har stor eller svært stor verdi.` : ''}`;
  if (N.klasser)
    t.klasser.forEach(([navn, id], v) => {
      /* tegnforklaring: tone, verdikategori, areal, antall og planlagt utbygging innenfor */
      const { antall, plan: pl } = N.klasser[v];
      const li = fargelinje(
        el('tegn'),
        id,
        navn,
        km(D.klasser[v]),
        `${nf(antall, 0)} ${antall === 1 ? 'lokalitet' : 'lokaliteter'}`
      );
      if (pl && D.regnet && !utenPlan()) {
        const b = document.createElement('b');
        b.textContent = ` · ca. ${daa(pl)} planlagt utbygging`;
        li.lastChild.appendChild(b);
      }
    });
  const E = D.ekstra,
    merk = el('merk'),
    hel = t.dekning ? el('helhet') : null,
    helhet = !!hel && !!N.helhet;
  if (hel) {
    hel.hidden = !helhet;
    hel.textContent = '';
  }
  if (helhet) {
    /* Tre striper: landarealet delt i kartlagt og ikke kartlagt, og så hver del for seg med verdsatt natur etter verdi.
       Det vi ikke vet noe om, tegnes som en tom ramme. Slik skilles «ingenting funnet» fra «ikke lett». */
    const { L, K, U, inne, ute, si, su } = N.helhet;
    const pst = (a, b) => (b > 0 ? nf((a / b) * 100) : '0'),
      lag = (type, tekst) => {
        const x = document.createElement(type);
        if (tekst) x.textContent = tekst;
        hel.appendChild(x);
        return x;
      };
    const stripe = (deler, hva) => {
      const b = lag('div');
      b.className = 'bar';
      b.setAttribute('role', 'img');
      b.setAttribute(
        'aria-label',
        hva +
          ': ' +
          deler
            .filter(d => d[2] > 0)
            .map(d => `${d[0]} ${nf((d[2] / deler.reduce((s, x) => s + x[2], 0)) * 100)} prosent`)
            .join(', ')
      );
      deler
        .filter(d => d[2] > 0)
        .forEach(([navn, stil, v]) => {
          const s = document.createElement('i');
          if (stil.startsWith('--')) s.style.cssText = `flex:${v} 1 0;background:var(${stil})`;
          else {
            s.className = stil;
            s.style.flex = `${v} 1 0`;
          }
          s.title = `${navn}: ${dekar(v)}`;
          b.appendChild(s);
        });
    };
    const verdier = a => t.klasser.map(([navn, id], v) => [navn, '--' + id, a[v]]),
      forklar = deler => {
        const f = lag('div');
        f.className = 'tegn';
        deler.forEach(([navn, stil, tall]) => {
          const x = document.createElement('span'),
            i = document.createElement('i'),
            b = document.createElement('b');
          i.className = stil;
          b.textContent = tall;
          x.append(i, navn + ' ', b);
          f.appendChild(x);
        });
      };
    lag('h3', 'Helhetsbildet: verdsatt natur og kartlegging');
    stripe(
      [
        ['Kartlagt', 'kjent', K],
        ['Ikke kartlagt', 'tom', U]
      ],
      'Landarealet'
    );
    forklar([
      ['Kartlagt', 'kjent', `${dekar(K)} (${pst(K, L)} %)`],
      ['Ikke kartlagt', 'tom', `${dekar(U)} (${pst(U, L)} %)`]
    ]);
    lag('h4', 'Der det er kartlagt');
    stripe([...verdier(inne), ['Ingen verdsatt natur registrert', 'kjent', Math.max(0, K - si)]], 'Det kartlagte');
    lag('p', `${pst(si, K)} % har verdsatt natur (${dekar(si)}).`);
    lag('h4', 'Der det ikke er kartlagt');
    stripe([...verdier(ute), ['Ukjent', 'tom', Math.max(0, U - su)]], 'Det som ikke er kartlagt');
    lag(
      'p',
      su > 0
        ? `${pst(su, U)} % har registrert verdsatt natur (${dekar(su)}), fra eldre kartlegging og utvalgte naturtyper. For resten finnes det ikke noe kart over hvor det er lett.`
        : 'Ingen verdsatt natur er registrert her, og det finnes ikke noe kart over hvor det er lett.'
    );
    lag(
      'p',
      `Fargene er de samme som i tabellen over. Lave tall der det ikke er kartlagt, kan bety at det ikke er lett, ikke at naturen mangler verdi. Det kartlagte er ikke et tilfeldig utvalg av kommunen, så andelen derfra kan ikke overføres direkte til resten.${E.fra ? ` Kartlagt etter Miljødirektoratets instruks ${E.fra === E.til ? E.fra : E.fra + '–' + E.til}.` : ''}`
    ).className = 'hint';
  }
  merk.textContent =
    !E || helhet
      ? ''
      : !(E.km2 > 0)
        ? 'Kommunen er ikke kartlagt etter Miljødirektoratets instruks. Laget viser da bare eldre registreringer og utvalgte naturtyper.'
        : `Ca. ${app.ssbSum ? nf(Math.min(100, (E.km2 / app.ssbSum) * 100)) + ' % av landarealet' : iTekst(E.km2)} er kartlagt etter Miljødirektoratets instruks${E.fra ? ` (${E.fra === E.til ? E.fra : E.fra + '–' + E.til})` : ''}. Utenfor det kartlagte kan det finnes verdifull natur som ikke er registrert.`;
  const { plan, smal } = N,
    der = app.ov && app.ov.dynamisk ? ' i den delen av kommunen det er hentet kart for' : '',
    vp = el('plan');
  vp.textContent = '';
  if (o.length) {
    if (utenPlan())
      vp.textContent =
        'Kommunen har ingen kommuneplan hos DiBK, så påvirkning fra planlagt utbygging kan ikke vurderes.';
    else if (!D.regnet) vp.textContent = 'Påvirkning fra planlagt utbygging regnes ut når kartet er hentet.';
    else {
      const ant = N.berort,
        b = document.createElement('b');
      b.textContent = plan
        ? `Ca. ${daa(plan)} planlagt utbygging ligger innenfor ${ant === 1 ? 'ett ' + t.en : ant + ' ' + t.fl}${der}.`
        : `Ingen planlagt utbygging innenfor ${t.best}${der}.`;
      vp.appendChild(b);
      if (smal)
        vp.appendChild(
          document.createTextNode(
            ` I tillegg kommer ca. ${daa(smal)} i smale striper, som oftest der grensene ikke er tegnet helt likt.`
          )
        );
    }
  }
  if (t.dekning && D.gap && D.gap.nat && D.regnet && !utenPlan()) {
    const G = D.gap,
      b = document.createElement('b');
    b.textContent = `Av ca. ${daa(G.nat)} planlagt utbygging på natur${der} ligger ca. ${daa(G.ukjent)} (${nf((G.ukjent / G.nat) * 100, 0)} %) i områder som ikke er kartlagt.`;
    el('gap').append(b, ' Der vet vi ikke om det finnes verdifull natur. Smale striper er ikke med.');
  }
  rad('un').textContent = !o.length
    ? ''
    : (t.dekning && E && app.ssbSum
        ? (E.km2 > 0
            ? `${nf(Math.min(100, (E.km2 / app.ssbSum) * 100), 0)} % av landarealet er kartlagt`
            : 'ikke kartlagt etter dagens instruks') + '\n'
        : '') +
      (utenPlan()
        ? 'ingen kommuneplan å krysse med'
        : !D.regnet
          ? 'planlagt utbygging ikke regnet ut ennå'
          : (plan
              ? `ca. ${dekar((plan * (OPPLOSNINGER[9] / 2) ** 2) / 1e6)} planlagt utbygging innenfor`
              : 'ingen planlagt utbygging innenfor') + (app.ov && app.ov.dynamisk ? ', i hentet kart' : ''));
  const vises = N.vises;
  const maks = t.samlet ? 15 : 40;
  vises.slice(0, maks).forEach(x => {
    const li = document.createElement('li'),
      a = document.createElement('b'),
      ar = document.createElement('span'),
      sm = document.createElement('small'),
      gjor = document.createElement('div');
    a.textContent = x.navn;
    ar.textContent = km(x.km2);
    li.id = `${t.id}-omr-${o.indexOf(x)}`;
    sm.textContent = x.under || '';
    if (x.plan) {
      const b = document.createElement('b');
      b.textContent = ` · ca. ${daa(x.plan)} planlagt utbygging`;
      sm.appendChild(b);
    }
    gjor.className = 'gjor';
    const kn = document.createElement('button');
    kn.type = 'button';
    kn.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5s4.5-4.2 4.5-7.7a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.7 4.5 7.7z"/><circle cx="8" cy="6.7" r="1.6"/></svg>Vis i kartet';
    kn.setAttribute('aria-label', `Vis ${x.navn} i kartet`);
    kn.addEventListener('click', () => visIKartet(t, x, li.id));
    gjor.appendChild(kn);
    if (x.url) {
      const l = document.createElement('a');
      l.href = x.url;
      l.target = '_blank';
      l.rel = 'noopener';
      l.innerHTML =
        'Åpne faktaark<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 3.5h-3v9h9v-3M9.5 3.5h3v3M12.5 3.5l-5.5 5.5"/></svg>';
      l.setAttribute('aria-label', `Åpne faktaark for ${x.navn} hos Miljødirektoratet, i ny fane`);
      l.title = 'Åpnes i ny fane';
      gjor.appendChild(l);
    }
    li.append(a, ar, sm, gjor);
    liste.appendChild(li);
  });
  if (vises.length > maks) {
    const li = document.createElement('li');
    li.textContent = `… og ${vises.length - maks} til`;
    liste.appendChild(li);
  }
}
/* Ett område valgt fra en liste: kartet flyttes dit, området får en tydelig ramme, og en liten merkelapp i kartet sier hva som vises
   og gir veien tilbake til listen. Markeringen står til et annet område velges, temaet slås av eller kommunen byttes. */
const markKilde = new ol.source.Vector();

const markStrek = [
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#fff', width: 8 }) }),
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#171C1A', width: 3.5 }) })
];
const markMidt = f => new ol.geom.Point(ol.extent.getCenter(f.getGeometry().getExtent()));
const markRing = [
  new ol.style.Style({
    geometry: markMidt,
    image: new ol.style.Circle({ radius: 13, stroke: new ol.style.Stroke({ color: '#fff', width: 8 }) })
  }),
  new ol.style.Style({
    geometry: markMidt,
    image: new ol.style.Circle({ radius: 13, stroke: new ol.style.Stroke({ color: '#171C1A', width: 3.5 }) })
  })
];
const markLag = new ol.layer.Vector({
  className: 'merket',
  source: markKilde,
  style: (f, res) => {
    const u = f.getGeometry().getExtent();
    return Math.max(u[2] - u[0], u[3] - u[1]) < 16 * res ? markRing : markStrek;
  }
});
function fjernMerket() {
  markKilde.clear();
  app.vist = null;
  $('vistmerke').hidden = true;
}
function visIKartet(t, o, liId) {
  if (!t.paa) {
    t.paa = true;
    t.knapp.setAttribute('aria-pressed', 'true');
    visNatur(t);
    const li = document.getElementById(liId),
      kn = li && li.querySelector('button');
    if (kn) kn.focus({ preventScroll: true });
  } /* listen ble tegnet på nytt: fokus tilbake på knappen */
  markKilde.clear();
  markKilde.addFeature(new ol.Feature(o.f.getGeometry()));
  app.vist = { t, liId };
  view.fit(o.ext, { padding: [56, 56, 96, 56], minResolution: OPPLOSNINGER[13], duration: rolig() ? 0 : 400 });
  $('vistmerke').hidden = false;
  $('vistmerke').firstElementChild.textContent = o.navn;
  tilKartet(true);
}
