/* Tallpanelet, knappene, valg av kommune og oppstart. */
/* Tallpanelet */
const rows = $('tallrader');
KL.forEach(([id, navn]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'row';
  b.id = 'vis-' + id;
  b.style.setProperty('--c', `var(--${id})`);
  b.setAttribute('aria-pressed', 'true');
  b.innerHTML = `<span class="sw"></span><span class="nm">${navn}</span><span class="km" id="km-${id}">–</span><span class="pc" id="pc-${id}">–</span>`;
  b.addEventListener('click', () => {
    app.vis[id] = !app.vis[id];
    b.setAttribute('aria-pressed', String(app.vis[id]));
    tegnOversikt();
    fargeleggFliser();
    if (id === 'nat') visInon();
  });
  rows.appendChild(b);
});
{
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'row lag';
  b.id = 'planknapp';
  b.setAttribute('aria-pressed', 'true');
  b.innerHTML =
    '<span class="sw"></span><span class="nm">Planlagt utbygging</span><span class="km"></span><span class="pc"></span>';
  rows.appendChild(b);
  const hode = document.createElement('div');
  hode.className = 'temahode';
  hode.innerHTML =
    '<b>Tema</b>Areal i kommunen, andel av landarealet og planlagt utbygging innenfor. Fargeruten viser temaet i kartet. Trykk ellers på raden for detaljer.';
  rows.appendChild(hode);
  NATURLAG.forEach(t => rows.append(t.rad, t.blokk));
  inonRad = temaRad('inon', 'Inngrepsfri natur', 'flate inon', k => {
    app.inonPaa = !app.inonPaa;
    k.setAttribute('aria-pressed', String(app.inonPaa));
    visInon();
  });
  inonRad.blokk.append(...$('mal-inon').content.children); /* bare elementene, ikke linjeskiftene mellom dem */
  rows.append(inonRad.rad, inonRad.blokk);
  graaRad = temaRad('graa', 'Grått areal', 'flate graa', k => {
    app.graaPaa = !app.graaPaa;
    k.setAttribute('aria-pressed', String(app.graaPaa));
    visGraa();
  });
  graaRad.blokk.append(...$('mal-graa').content.children); /* bare elementene, ikke linjeskiftene mellom dem */
  rows.append(graaRad.rad, graaRad.blokk);
}
/* Teknisk informasjon til feilsøking: utgave, måling av hvor jevnt kartet går, siste kall under kartet og listen over kall.
   Skjult til vanlig. Valget lagres ikke i nettleseren, men står i adressen (?teknisk), så siden kan åpnes med det slått på. */
{
  const kn = $('tekknapp'),
    sett = paa => {
      document.documentElement.classList.toggle('teknisk', paa);
      kn.setAttribute('aria-expanded', String(paa));
      kn.textContent = paa ? 'Skjul teknisk informasjon' : 'Vis teknisk informasjon';
    };
  sett(new URLSearchParams(location.search).has('teknisk'));
  kn.addEventListener('click', () => {
    const paa = kn.getAttribute('aria-expanded') !== 'true';
    sett(paa);
    try {
      const u = new URL(location.href);
      if (paa) u.searchParams.set('teknisk', '');
      else u.searchParams.delete('teknisk');
      history.replaceState(null, '', u.pathname + u.search.replace(/=(&|$)/g, '$1') + u.hash);
    } catch (e) {}
  });
}
$('tegnknapp').addEventListener('click', startTegning);
$('lastknapp').addEventListener('click', () => $('planfil').click());
$('planfil').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  lastOppPlan(f);
});
{
  const st = document.querySelector('.stage');
  st.addEventListener('dragover', e => {
    e.preventDefault();
    st.classList.add('slipp');
  });
  st.addEventListener('dragleave', () => st.classList.remove('slipp'));
  st.addEventListener('drop', e => {
    e.preventDefault();
    st.classList.remove('slipp');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) lastOppPlan(f);
  });
}
$('tegnavbryt').addEventListener('click', () => {
  sluttTegning();
  $('tegnknapp').focus();
});
$('tegnangre').addEventListener('click', () => {
  if (tegn) tegn.removeLastPoint();
});
$('tegnferdig').addEventListener('click', () => {
  if (tegn) tegn.finishDrawing();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && tegner()) sluttTegning();
});
$('vistlukk').addEventListener('click', fjernMerket);
$('vistliste').addEventListener('click', () => {
  if (!app.vist) return;
  const t = app.vist.t,
    apne = t.rad.querySelector('.apne');
  if (apne.getAttribute('aria-expanded') !== 'true') apne.click();
  const li = document.getElementById(app.vist.liId) || t.blokk;
  li.scrollIntoView({ behavior: rolig() ? 'auto' : 'smooth', block: 'center' });
  const kn = li.querySelector('button');
  if (kn) kn.focus({ preventScroll: true });
});
$('smale').addEventListener('change', e => {
  app.visSmale = e.target.checked;
  friskOpp(planLag);
});
$('planknapp').addEventListener('click', e => {
  app.planPaa = !app.planPaa;
  e.currentTarget.setAttribute('aria-pressed', String(app.planPaa));
  visPlanLag();
  nyttSlor();
});
async function hentGrense(k, mitt, behold) {
  try {
    const j = await hent('Kartverket', `Grense for ${k.navn}`, `${KV}/kommuner/${k.nr}/omrade?utkoordsys=25833`);
    if (mitt !== valgNr) return;
    const geom = new ol.format.GeoJSON().readGeometry(j.omrade, { dataProjection: UTM, featureProjection: UTM });
    grenseKilde.clear();
    grenseKilde.addFeature(new ol.Feature(geom));
    app.flate = geom.getArea() / utm33(geom);
    visVann(); /* flaten i km², rettet for målestokken i kartprojeksjonen */
    app.klipp = geom;
    tema.setExtent(geom.getExtent());
    planLag.setExtent(geom.getExtent());
    inonLag.setExtent(geom.getExtent());
    graaLag.setExtent(geom.getExtent());
    dekLag.setExtent(geom.getExtent());
    tema.setVisible(true);
    visPlan();
    sjekkPlan(k, geom, mitt);
    sjekkInon(k, geom, mitt);
    sjekkGraa(k, geom, mitt);
    NATURLAG.forEach(t => hentNatur(t, k, geom, mitt));
    if (!app.oversikter[k.nr]) nySamling(k.nr, geom.getExtent());
    if (!k.boks && !behold) view.fit(geom.getExtent(), { padding: [16, 16, 16, 16], duration: 350 });
  } catch (e) {
    if (mitt === valgNr) {
      $('probe').textContent = 'Kommunegrensen kunne ikke hentes.';
      tema.setVisible(true);
    }
  }
}

const fSel = $('fylke'),
  kSel = $('kommune');
const finn = nr => {
  for (const f of app.fylker) for (const k of f.kommuner) if (k.nr === nr) return [f, k];
  return null;
};
function fyllKommuner(f, nr) {
  kSel.length = 0;
  f.kommuner.forEach(k => kSel.add(new Option(k.navn, k.nr)));
  kSel.value = nr || f.kommuner[0].nr;
}
function velg(nr, behold) {
  /* behold: kartet blir stående der det er, brukes når kommunen velges i kartet */
  const t = finn(nr);
  if (!t) return;
  const [f, k] = t,
    mitt = ++valgNr;
  app.valgt = k;
  lukkBytt();
  if (fSel.value !== f.nr) {
    fSel.value = f.nr;
    fyllKommuner(f, nr);
  }
  kSel.value = nr;
  try {
    history.replaceState(null, '', '#' + nr);
  } catch (e) {}
  $('navn').textContent = k.navn;
  $('under').textContent = `${f.navn} fylke · kommunenummer ${k.nr}`;
  $('probe').textContent = 'Trykk i kommunen for å se klassen, eller utenfor for å bytte kommune.';
  nullstillTall('henter');
  grenseKilde.clear();
  app.klipp = null;
  app.flate = 0;
  app.planRaster = null;
  app.historie = null;
  app.planSum = null;
  visUtvikling();
  clearTimeout(etterTimer);
  etterVenter = false;
  app.planInfo = null;
  sluttTegning();
  visEgneLag();
  visPlanInfo();
  visEgne();
  fjernMerket();
  app.inon = null;
  visInon();
  app.graa = null;
  app.graaKryss = null;
  visGraa();
  NATURLAG.forEach(t => {
    t.data = null;
    t.kilde.clear();
    visNatur(t);
  });
  tema.setVisible(false);
  tema.setExtent(undefined);
  visPlan();
  $('siste').textContent = '';
  hentOversikt(k, mitt);
  if (k.boks && !behold)
    view.fit(ol.proj.transformExtent(k.boks, 'EPSG:4326', UTM), { padding: [16, 16, 16, 16], duration: 350 });
  hentTall(k, mitt);
  hentHistorie(k, mitt);
  hentGrense(k, mitt, behold);
  kartStatus();
}
fSel.addEventListener('change', () => {
  const f = app.fylker.find(x => x.nr === fSel.value);
  fyllKommuner(f);
  velg(kSel.value);
});
kSel.addEventListener('change', () => velg(kSel.value));

const boksAv = b => {
  const c = b && b.coordinates && b.coordinates[0];
  if (!c) return null;
  const x = c.map(q => q[0]),
    y = c.map(q => q[1]);
  return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
};
hent('Egen fil', 'Fylker og kommuner', 'kommuner.json', true)
  .then(j =>
    j.map(f => ({ nr: f[0], navn: f[1], kommuner: f[2].map(k => ({ nr: k[0], navn: k[1], boks: k.slice(2) })) }))
  )
  .catch(() =>
    hent('Kartverket', 'Fylker og kommuner', `${KV}/fylkerkommuner`).then(j =>
      j.map(f => ({
        nr: f.fylkesnummer,
        navn: f.fylkesnavn,
        kommuner: f.kommuner.map(k => ({
          nr: k.kommunenummer,
          navn: k.kommunenavnNorsk,
          boks: boksAv(k.avgrensningsboks)
        }))
      }))
    )
  )
  .then(async liste => {
    const reg = await hent('Egen fil', 'Register over oversiktsbilder', 'oversikt.json', true).catch(() => null);
    if (reg && reg.kommuner) app.oversikter = reg.kommuner;
    app.fylker = liste.sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
    app.fylker.forEach(f => f.kommuner.sort((a, b) => a.navn.localeCompare(b.navn, 'nb')));
    fSel.length = 0;
    app.fylker.forEach(f => fSel.add(new Option(f.navn, f.nr)));
    const medBilde = Object.keys(app.oversikter).filter(nr => finn(nr));
    if (medBilde.length) {
      const o = $('omoversikt'),
        hvem = medBilde.length === 1 ? finn(medBilde[0])[1].navn : medBilde.length + ' kommuner';
      o.textContent = `For ${hvem} ligger også et ferdig oversiktsbilde lagret (${reg.versjon}, hentet ${reg.hentet}). Det vises når kartet er zoomet ut, og fliser fra NIBIO tar over når du zoomer inn.`;
      o.hidden = false;
    }
    let forst = (location.hash || '').replace('#', '');
    if (!finn(forst)) forst = finn('5001') ? '5001' : app.fylker[0].kommuner[0].nr;
    const f0 = finn(forst)[0];
    fSel.value = f0.nr;
    fyllKommuner(f0, forst);
    velg(forst);
  })
  .catch(() => {
    $('navn').textContent = 'Kommunelisten kunne ikke hentes';
    $('under').textContent = 'Sjekk nettforbindelsen og last siden på nytt.';
  });

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', tegnPaaNytt);
new MutationObserver(tegnPaaNytt).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});
