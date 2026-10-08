/* Valg av kommune, kommunegrensen og oppstart. */
import GeoJSON from 'ol/format/GeoJSON';
import Feature from 'ol/Feature';
import { transformExtent } from 'ol/proj';
import { UTM, KV, M, app, endret, hent, finn, utm33 } from './felles.js';
import { tema, fargeleggFliser } from './fliser.js';
import { hentOversikt, nySamling, tegnOversikt } from './oversikt.js';
import { planLag, sjekkPlan, visPlan } from './plan.js';
import { NATURLAG, dekLag, hentNatur, visNatur, fjernMerket } from './naturtema.js';
import { inonLag, sjekkInon, visInon } from './inon.js';
import { graaLag, sjekkGraa, visGraa } from './graa.js';
import { sluttTegning, visEgneLag } from './egne.js';
import { nullstillTall, hentTall, hentHistorie } from './tall.js';
import { kart, view, grenseKilde, lagKart, lukkBytt, kartStatus } from './kart.js';

async function hentGrense(k, mitt, behold) {
  try {
    const j = await hent('Kartverket', `Grense for ${k.navn}`, `${KV}/kommuner/${k.nr}/omrade?utkoordsys=25833`);
    if (mitt !== M.valgNr) return;
    const geom = new GeoJSON().readGeometry(j.omrade, { dataProjection: UTM, featureProjection: UTM });
    grenseKilde.clear();
    grenseKilde.addFeature(new Feature(geom));
    app.flate = geom.getArea() / utm33(geom); /* flaten i km², rettet for målestokken i kartprojeksjonen */
    app.klipp = geom;
    endret();
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
    if (mitt === M.valgNr) {
      app.probe = { tekst: 'Kommunegrensen kunne ikke hentes.' };
      endret();
      tema.setVisible(true);
    }
  }
}
export function velg(nr, behold) {
  /* behold: kartet blir stående der det er, brukes når kommunen velges i kartet */
  const t = finn(nr);
  if (!t) return;
  const [, k] = t,
    mitt = ++M.valgNr;
  app.valgt = k;
  lukkBytt();
  try {
    history.replaceState(null, '', '#' + nr);
  } catch (e) {}
  app.probe = { tekst: 'Trykk i kommunen for å se klassen, eller utenfor for å bytte kommune.' };
  nullstillTall('henter');
  grenseKilde.clear();
  app.klipp = null;
  app.flate = 0;
  app.planRaster = null;
  app.historie = null;
  app.planSum = null;
  clearTimeout(M.etterTimer);
  M.etterVenter = false;
  app.planInfo = null;
  sluttTegning();
  visEgneLag();
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
  app.siste = '';
  endret();
  hentOversikt(k, mitt);
  if (k.boks && !behold)
    view.fit(transformExtent(k.boks, 'EPSG:4326', UTM), { padding: [16, 16, 16, 16], duration: 350 });
  hentTall(k, mitt);
  hentHistorie(k, mitt);
  hentGrense(k, mitt, behold);
  kartStatus();
}
/* Fylket er byttet i velgeren: den første kommunen i fylket velges. */
export function velgFylke(nr) {
  const f = app.fylker.find(x => x.nr === nr);
  if (f) velg(f.kommuner[0].nr);
}
/* En arealklasse i tallpanelet slås av eller på i kartet. */
export function byttKlasse(id) {
  app.vis[id] = !app.vis[id];
  tegnOversikt();
  fargeleggFliser();
  if (id === 'nat') visInon();
  endret();
}

const boksAv = b => {
  const c = b && b.coordinates && b.coordinates[0];
  if (!c) return null;
  const x = c.map(q => q[0]),
    y = c.map(q => q[1]);
  return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
};
function oppstart() {
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
      if (reg && reg.kommuner) {
        app.oversikter = reg.kommuner;
        app.register = { versjon: reg.versjon, hentet: reg.hentet };
      }
      app.fylker = liste.sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
      app.fylker.forEach(f => f.kommuner.sort((a, b) => a.navn.localeCompare(b.navn, 'nb')));
      let forst = (location.hash || '').replace('#', '');
      if (!finn(forst)) forst = finn('5001') ? '5001' : app.fylker[0].kommuner[0].nr;
      velg(forst);
    })
    .catch(() => {
      app.kommunerFeil = true;
      endret();
    });
}
/* Starter kartet i kartflaten første gang siden tegnes. Tegnes siden på nytt, flyttes kartet til den nye flaten. */
export function startKart(maal) {
  if (kart) {
    kart.setTarget(maal);
    return;
  }
  lagKart(maal);
  oppstart();
}
